import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type { InstallStep } from './index.js';
import { runCommand, getMurphDir } from '../util.js';

export const migrate: InstallStep = {
  name: 'migrate',
  label: 'Database Migrations',
  description: 'Run database schema migrations',
  required: true,

  async check() {
    return 'needed';
  },

  async execute(emit) {
    const cwd = getMurphDir();

    emit('Running database migrations...');

    // Prefer compiled JS, fall back to TS with node's type stripping
    const migrateJs = join(cwd, 'scripts', 'migrate.js');
    const migrateTs = join(cwd, 'scripts', 'migrate.ts');

    if (existsSync(migrateJs)) {
      await runCommand('node', [migrateJs], emit, { cwd });
    } else if (existsSync(migrateTs)) {
      await runCommand('node', ['--experimental-strip-types', migrateTs], emit, { cwd });
    } else {
      throw new Error('Migration script not found (scripts/migrate.js or scripts/migrate.ts)');
    }

    emit('Migrations complete');
  },
};
