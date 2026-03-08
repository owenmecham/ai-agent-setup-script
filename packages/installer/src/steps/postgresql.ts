import { spawnSync } from 'node:child_process';
import type { InstallStep } from './index.js';
import { runCommand, spawnSyncSafe } from '../util.js';

export const postgresql: InstallStep = {
  name: 'postgresql',
  label: 'PostgreSQL 16 + pgvector',
  description: 'Install PostgreSQL 16 with pgvector extension and create database',
  required: true,

  async check() {
    // Check if PostgreSQL is installed and murph database exists
    const brewCheck = spawnSyncSafe('brew', ['list', 'postgresql@16'], { stdio: 'pipe' });
    if (brewCheck.status !== 0) return 'needed';

    const dbCheck = spawnSyncSafe('psql', ['-lqt'], {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, PATH: `/opt/homebrew/opt/postgresql@16/bin:${process.env.PATH}` },
    });
    if (dbCheck.status !== 0) return 'needed';
    if (!dbCheck.stdout.toString().includes('murph')) return 'needed';

    return 'done';
  },

  async execute(emit) {
    const pgBinPath = '/opt/homebrew/opt/postgresql@16/bin';
    process.env.PATH = `${pgBinPath}:${process.env.PATH}`;

    // Install PostgreSQL 16
    const brewCheck = spawnSyncSafe('brew', ['list', 'postgresql@16'], { stdio: 'pipe' });
    if (brewCheck.status !== 0) {
      emit('Installing PostgreSQL 16...');
      await runCommand('brew', ['install', 'postgresql@16'], emit);
    } else {
      emit('PostgreSQL 16 already installed');
    }

    // Install pgvector
    const pgConfig = `${pgBinPath}/pg_config`;
    const sharedir = spawnSyncSafe(pgConfig, ['--sharedir'], { stdio: 'pipe' }).stdout.toString().trim();
    const vectorControl = `${sharedir}/extension/vector.control`;

    const { existsSync } = await import('node:fs');
    if (!existsSync(vectorControl)) {
      emit('Building pgvector from source...');
      const tmpdir = spawnSync('mktemp', ['-d'], { stdio: 'pipe' }).stdout.toString().trim();
      await runCommand('git', ['clone', '--branch', 'v0.8.0', '--depth', '1', 'https://github.com/pgvector/pgvector.git', tmpdir], emit);
      await runCommand('make', ['-C', tmpdir, `PG_CONFIG=${pgConfig}`], emit);
      await runCommand('make', ['-C', tmpdir, 'install', `PG_CONFIG=${pgConfig}`], emit);
      spawnSync('rm', ['-rf', tmpdir], { stdio: 'ignore' });
    } else {
      emit('pgvector already installed');
    }

    // Start PostgreSQL service
    const serviceCheck = spawnSyncSafe('brew', ['services', 'list'], { stdio: 'pipe' });
    if (!serviceCheck.stdout.toString().includes('postgresql@16') ||
        !serviceCheck.stdout.toString().match(/postgresql@16\s+started/)) {
      emit('Starting PostgreSQL service...');
      await runCommand('brew', ['services', 'start', 'postgresql@16'], emit);

      // Wait for PostgreSQL to be ready
      let ready = false;
      for (let i = 0; i < 15; i++) {
        const pgReady = spawnSyncSafe('pg_isready', [], { stdio: 'pipe' });
        if (pgReady.status === 0) {
          ready = true;
          break;
        }
        await new Promise(r => setTimeout(r, 2000));
      }
      if (!ready) throw new Error('PostgreSQL failed to start');
    }

    // Create database
    const dbCheck = spawnSyncSafe('psql', ['-lqt'], { stdio: ['ignore', 'pipe', 'pipe'] });
    if (!dbCheck.stdout.toString().includes('murph')) {
      emit('Creating murph database...');
      await runCommand('createdb', ['murph'], emit);
      await runCommand('psql', ['-d', 'murph', '-c', 'CREATE EXTENSION IF NOT EXISTS "uuid-ossp";'], emit);
      await runCommand('psql', ['-d', 'murph', '-c', 'CREATE EXTENSION IF NOT EXISTS "vector";'], emit);
    } else {
      emit('Database "murph" already exists');
    }

    emit('PostgreSQL setup complete');
  },
};
