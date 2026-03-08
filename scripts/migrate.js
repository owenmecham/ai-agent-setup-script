"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const pg_1 = require("pg");
const node_fs_1 = require("node:fs");
const node_path_1 = require("node:path");
const yaml_1 = require("yaml");
async function main() {
    // Load config
    const configPath = (0, node_path_1.resolve)(process.cwd(), 'murph.config.yaml');
    const config = (0, yaml_1.parse)((0, node_fs_1.readFileSync)(configPath, 'utf-8'));
    const dbUrl = config.database?.url ?? 'postgresql://localhost:5432/murph';
    const pool = new pg_1.Pool({ connectionString: dbUrl });
    // Create migrations tracking table
    await pool.query(`
    CREATE TABLE IF NOT EXISTS _migrations (
      name TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);
    // Get already applied migrations
    const applied = await pool.query('SELECT name FROM _migrations ORDER BY name');
    const appliedSet = new Set(applied.rows.map((r) => r.name));
    // Find all migration files
    const migrationDirs = [
        (0, node_path_1.join)(process.cwd(), 'packages', 'memory', 'src', 'migrations'),
        (0, node_path_1.join)(process.cwd(), 'packages', 'knowledge', 'src', 'migrations'),
    ];
    const migrations = [];
    for (const dir of migrationDirs) {
        try {
            const files = (0, node_fs_1.readdirSync)(dir).filter((f) => f.endsWith('.sql')).sort();
            for (const file of files) {
                migrations.push({ name: file, path: (0, node_path_1.join)(dir, file) });
            }
        }
        catch {
            // Directory may not exist yet
        }
    }
    // Sort all migrations by name
    migrations.sort((a, b) => a.name.localeCompare(b.name));
    // Apply pending migrations
    let count = 0;
    for (const migration of migrations) {
        if (appliedSet.has(migration.name))
            continue;
        console.log(`Applying migration: ${migration.name}`);
        const sql = (0, node_fs_1.readFileSync)(migration.path, 'utf-8');
        try {
            await pool.query('BEGIN');
            await pool.query(sql);
            await pool.query('INSERT INTO _migrations (name) VALUES ($1)', [migration.name]);
            await pool.query('COMMIT');
            count++;
        }
        catch (err) {
            await pool.query('ROLLBACK');
            console.error(`Failed to apply migration ${migration.name}:`, err);
            process.exit(1);
        }
    }
    if (count === 0) {
        console.log('All migrations already applied.');
    }
    else {
        console.log(`Applied ${count} migration(s) successfully.`);
    }
    await pool.end();
}
main().catch((err) => {
    console.error('Migration failed:', err);
    process.exit(1);
});
