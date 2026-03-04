import pg from 'pg';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parse as parseYaml } from 'yaml';

let pool: pg.Pool | null = null;

function getDatabaseUrl(): string {
  try {
    const configPath = resolve(process.cwd(), 'murph.config.yaml');
    const raw = readFileSync(configPath, 'utf-8');
    const config = parseYaml(raw) as { database?: { url?: string } };
    return config?.database?.url ?? 'postgresql://localhost:5432/murph';
  } catch {
    return 'postgresql://localhost:5432/murph';
  }
}

export function getPool(): pg.Pool {
  if (!pool) {
    pool = new pg.Pool({
      connectionString: getDatabaseUrl(),
      max: 5,
    });
  }
  return pool;
}
