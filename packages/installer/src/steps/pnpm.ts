import { spawnSync } from 'node:child_process';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { mkdirSync, existsSync } from 'node:fs';
import type { InstallStep } from './index.js';

export const pnpmStep: InstallStep = {
  name: 'pnpm',
  label: 'pnpm',
  description: 'Install pnpm package manager via corepack',
  required: true,

  async check() {
    const result = spawnSync('pnpm', ['--version'], { stdio: 'pipe' });
    return result.status === 0 ? 'done' : 'needed';
  },

  async execute(emit) {
    const pnpmCheck = spawnSync('pnpm', ['--version'], { stdio: 'pipe' });
    if (pnpmCheck.status === 0) {
      emit(`pnpm ${pnpmCheck.stdout.toString().trim()} already installed`);
      return;
    }

    emit('Enabling corepack and installing pnpm (admin privileges required)...');
    const result = spawnSync('osascript', [
      '-e',
      'do shell script "corepack enable && corepack prepare pnpm@latest --activate" with administrator privileges',
    ], { stdio: ['ignore', 'pipe', 'pipe'], timeout: 60_000 });
    if (result.status !== 0) {
      const stderr = result.stderr?.toString().trim() || 'unknown error';
      throw new Error(`corepack setup failed: ${stderr}`);
    }

    // Ensure pnpm global bin directory exists
    const pnpmHome = join(homedir(), 'Library', 'pnpm');
    if (!existsSync(pnpmHome)) {
      mkdirSync(pnpmHome, { recursive: true });
    }
    process.env.PNPM_HOME = pnpmHome;
    process.env.PATH = `${pnpmHome}:${process.env.PATH}`;

    emit('pnpm installed');
  },
};
