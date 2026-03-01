import { Pool } from 'pg';
import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parse as parseYaml } from 'yaml';

async function main() {
  // Load config
  const configPath = resolve(process.cwd(), 'murph.config.yaml');
  const config = parseYaml(readFileSync(configPath, 'utf-8'));
  const dbUrl = config.database?.url ?? 'postgresql://localhost:5432/murph';

  const pool = new Pool({ connectionString: dbUrl });

  // Create migrations tracking table
  await pool.query(`
    CREATE TABLE IF NOT EXISTS _migrations (
      name TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);

  // Get already applied migrations
  const applied = await pool.query('SELECT name FROM _migrations ORDER BY name');
  const appliedSet = new Set(applied.rows.map((r: { name: string }) => r.name));

  // Find all migration files
  const migrationDirs = [
    join(process.cwd(), 'packages', 'memory', 'src', 'migrations'),
    join(process.cwd(), 'packages', 'knowledge', 'src', 'migrations'),
  ];

  const migrations: Array<{ name: string; path: string }> = [];

  for (const dir of migrationDirs) {
    try {
      const files = readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
      for (const file of files) {
        migrations.push({ name: file, path: join(dir, file) });
      }
    } catch {
      // Directory may not exist yet
    }
  }

  // Sort all migrations by name
  migrations.sort((a, b) => a.name.localeCompare(b.name));

  // Apply pending migrations
  let count = 0;
  for (const migration of migrations) {
    if (appliedSet.has(migration.name)) continue;

    console.log(`Applying migration: ${migration.name}`);
    const sql = readFileSync(migration.path, 'utf-8');

    try {
      await pool.query('BEGIN');
      await pool.query(sql);
      await pool.query('INSERT INTO _migrations (name) VALUES ($1)', [migration.name]);
      await pool.query('COMMIT');
      count++;
    } catch (err) {
      await pool.query('ROLLBACK');
      console.error(`Failed to apply migration ${migration.name}:`, err);
      process.exit(1);
    }
  }

  if (count === 0) {
    console.log('All migrations already applied.');
  } else {
    console.log(`Applied ${count} migration(s) successfully.`);
  }

  await pool.end();
}

main().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
