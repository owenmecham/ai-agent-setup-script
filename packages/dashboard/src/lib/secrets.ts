// Import SecretStore directly to avoid pulling in auth.ts (bcrypt/keytar)
// through the barrel export, which causes webpack bundling issues
import { SecretStore } from '@murph/security/dist/secret-store.js';
import { getPool } from './db';

let store: SecretStore | null = null;

export async function getSecretStore(): Promise<SecretStore> {
  if (!store) {
    store = new SecretStore();
    await store.init(getPool());
  }
  return store;
}
