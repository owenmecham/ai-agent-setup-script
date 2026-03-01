import { randomBytes, createCipheriv, createDecipheriv } from 'node:crypto';
import type { Pool } from 'pg';

const SERVICE_NAME = 'murph-agent';
const ACCOUNT_NAME = 'master-key';
const ALGORITHM = 'aes-256-gcm';

export class SecretStore {
  private masterKey: Buffer | null = null;
  private pool: Pool | null = null;

  async init(pool?: Pool): Promise<void> {
    this.pool = pool ?? null;
    this.masterKey = await this.getMasterKey();
  }

  setPool(pool: Pool): void {
    this.pool = pool;
  }

  private async getMasterKey(): Promise<Buffer> {
    try {
      const keytar = await import('keytar');
      let key = await keytar.default.getPassword(SERVICE_NAME, ACCOUNT_NAME);
      if (!key) {
        // Generate a new master key and store in Keychain
        const newKey = randomBytes(32).toString('hex');
        await keytar.default.setPassword(SERVICE_NAME, ACCOUNT_NAME, newKey);
        key = newKey;
      }
      return Buffer.from(key, 'hex');
    } catch {
      // Fallback: use a derived key from environment or generate one
      const envKey = process.env.MURPH_MASTER_KEY;
      if (envKey) {
        return Buffer.from(envKey, 'hex');
      }
      // Last resort: generate ephemeral key (secrets won't persist across restarts)
      console.warn('WARNING: Using ephemeral master key. Secrets will not persist.');
      return randomBytes(32);
    }
  }

  private encrypt(plaintext: string): { encrypted: string; iv: string; authTag: string } {
    if (!this.masterKey) throw new Error('SecretStore not initialized');
    const iv = randomBytes(16);
    const cipher = createCipheriv(ALGORITHM, this.masterKey, iv);
    let encrypted = cipher.update(plaintext, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    const authTag = cipher.getAuthTag().toString('hex');
    return { encrypted, iv: iv.toString('hex'), authTag };
  }

  private decrypt(encrypted: string, iv: string, authTag: string): string {
    if (!this.masterKey) throw new Error('SecretStore not initialized');
    const decipher = createDecipheriv(ALGORITHM, this.masterKey, Buffer.from(iv, 'hex'));
    decipher.setAuthTag(Buffer.from(authTag, 'hex'));
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  }

  async set(name: string, value: string): Promise<void> {
    if (!this.pool) throw new Error('Database pool not set');
    const { encrypted, iv, authTag } = this.encrypt(value);
    await this.pool.query(
      `INSERT INTO secrets (name, encrypted_value, iv, auth_tag, updated_at)
       VALUES ($1, $2, $3, $4, NOW())
       ON CONFLICT (name) DO UPDATE SET
         encrypted_value = EXCLUDED.encrypted_value,
         iv = EXCLUDED.iv,
         auth_tag = EXCLUDED.auth_tag,
         updated_at = NOW()`,
      [name, encrypted, iv, authTag],
    );
  }

  async get(name: string): Promise<string | null> {
    if (!this.pool) throw new Error('Database pool not set');
    const result = await this.pool.query(
      `SELECT encrypted_value, iv, auth_tag FROM secrets WHERE name = $1`,
      [name],
    );
    if (result.rows.length === 0) return null;
    const row = result.rows[0];
    return this.decrypt(row.encrypted_value, row.iv, row.auth_tag);
  }

  async delete(name: string): Promise<void> {
    if (!this.pool) throw new Error('Database pool not set');
    await this.pool.query(`DELETE FROM secrets WHERE name = $1`, [name]);
  }

  async list(): Promise<string[]> {
    if (!this.pool) throw new Error('Database pool not set');
    const result = await this.pool.query(`SELECT name FROM secrets ORDER BY name`);
    return result.rows.map((row: { name: string }) => row.name);
  }

  async resolveSecretRefs(config: Record<string, unknown>): Promise<Record<string, unknown>> {
    const resolved: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(config)) {
      if (typeof value === 'string') {
        const match = value.match(/^\$\{(\w+)\}$/);
        if (match) {
          const secretValue = await this.get(match[1]);
          resolved[key] = secretValue ?? value;
        } else {
          resolved[key] = value;
        }
      } else if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
        resolved[key] = await this.resolveSecretRefs(value as Record<string, unknown>);
      } else {
        resolved[key] = value;
      }
    }
    return resolved;
  }
}
