interface Pool {
  query(text: string, values?: unknown[]): Promise<{ rows: Record<string, unknown>[] }>;
}
import type { AuditEntry } from './types.js';
import { createLogger } from './logger.js';

const logger = createLogger('audit-logger');

export class AuditLogger {
  private pool: Pool | null = null;
  private buffer: AuditEntry[] = [];

  setPool(pool: Pool): void {
    this.pool = pool;
  }

  async log(entry: Omit<AuditEntry, 'id' | 'timestamp'>): Promise<void> {
    const fullEntry: AuditEntry = {
      id: crypto.randomUUID(),
      timestamp: new Date(),
      ...entry,
    };

    logger.info({ action: entry.action, status: entry.status }, 'Audit log');

    if (!this.pool) {
      this.buffer.push(fullEntry);
      return;
    }

    try {
      await this.pool.query(
        `INSERT INTO audit_log (id, timestamp, action, status, channel, conversation_id, user_id, parameters, result, error)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [
          fullEntry.id,
          fullEntry.timestamp,
          fullEntry.action,
          fullEntry.status,
          fullEntry.channel,
          fullEntry.conversationId,
          fullEntry.userId,
          JSON.stringify(fullEntry.parameters ?? null),
          JSON.stringify(fullEntry.result ?? null),
          fullEntry.error ?? null,
        ],
      );
    } catch (err) {
      logger.error({ err }, 'Failed to write audit log to database');
      this.buffer.push(fullEntry);
    }
  }

  async flush(): Promise<void> {
    if (!this.pool || this.buffer.length === 0) return;

    const entries = [...this.buffer];
    this.buffer = [];

    for (const entry of entries) {
      try {
        await this.pool.query(
          `INSERT INTO audit_log (id, timestamp, action, status, channel, conversation_id, user_id, parameters, result, error)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
           ON CONFLICT (id) DO NOTHING`,
          [
            entry.id,
            entry.timestamp,
            entry.action,
            entry.status,
            entry.channel,
            entry.conversationId,
            entry.userId,
            JSON.stringify(entry.parameters ?? null),
            JSON.stringify(entry.result ?? null),
            entry.error ?? null,
          ],
        );
      } catch (err) {
        logger.error({ err }, 'Failed to flush audit log entry');
      }
    }
  }

  async query(opts: {
    limit?: number;
    offset?: number;
    action?: string;
    status?: string;
    channel?: string;
    since?: Date;
  }): Promise<AuditEntry[]> {
    if (!this.pool) return [];

    const conditions: string[] = [];
    const params: unknown[] = [];
    let paramIndex = 1;

    if (opts.action) {
      conditions.push(`action = $${paramIndex++}`);
      params.push(opts.action);
    }
    if (opts.status) {
      conditions.push(`status = $${paramIndex++}`);
      params.push(opts.status);
    }
    if (opts.channel) {
      conditions.push(`channel = $${paramIndex++}`);
      params.push(opts.channel);
    }
    if (opts.since) {
      conditions.push(`timestamp >= $${paramIndex++}`);
      params.push(opts.since);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const limit = opts.limit ?? 50;
    const offset = opts.offset ?? 0;

    const result = await this.pool.query(
      `SELECT * FROM audit_log ${where} ORDER BY timestamp DESC LIMIT $${paramIndex++} OFFSET $${paramIndex}`,
      [...params, limit, offset],
    );

    return result.rows.map((row: Record<string, unknown>) => ({
      id: row.id as string,
      timestamp: row.timestamp as Date,
      action: row.action as string,
      status: row.status as AuditEntry['status'],
      channel: row.channel as string,
      conversationId: row.conversation_id as string,
      userId: row.user_id as string,
      parameters: row.parameters as Record<string, unknown> | undefined,
      result: row.result,
      error: row.error as string | undefined,
    }));
  }
}
