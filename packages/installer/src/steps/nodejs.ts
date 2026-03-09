import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import type { InstallStep } from './index.js';
import { runCommand } from '../util.js';

export const nodejs: InstallStep = {
  name: 'nodejs',
  label: 'Node.js 22+',
  description: 'Install Node.js 22+ via nvm',
  required: true,

  async check() {
    const result = spawnSync('node', ['--version'], { stdio: 'pipe' });
    if (result.status !== 0) return 'needed';
    const version = result.stdout.toString().trim().replace('v', '');
    const major = parseInt(version.split('.')[0], 10);
    return major >= 22 ? 'done' : 'needed';
  },

  async execute(emit) {
    // Check current node version
    const nodeCheck = spawnSync('node', ['--version'], { stdio: 'pipe' });
    if (nodeCheck.status === 0) {
      const major = parseInt(nodeCheck.stdout.toString().trim().replace('v', '').split('.')[0], 10);
      if (major >= 22) {
        emit(`Node.js ${nodeCheck.stdout.toString().trim()} already installed`);
        return;
      }
    }

    const nvmDir = join(homedir(), '.nvm');

    // Install nvm if not present
    if (!existsSync(join(nvmDir, 'nvm.sh'))) {
      emit('Installing nvm...');
      await runCommand(
        '/bin/bash',
        ['-c', 'curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.0/install.sh | bash'],
        emit,
      );
    }

    // Install Node.js 22 via nvm
    emit('Installing Node.js 22 via nvm...');
    const nvmScript = `. "${nvmDir}/nvm.sh" && nvm install 22 && nvm use 22 && which node`;
    const result = spawnSync('/bin/bash', ['-c', nvmScript], {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, NVM_DIR: nvmDir },
    });

    if (result.status !== 0) {
      throw new Error(`Failed to install Node.js: ${result.stderr.toString()}`);
    }

    // Update PATH with the new node location
    const nodePath = result.stdout.toString().trim().replace(/\/node$/, '');
    if (nodePath && existsSync(nodePath)) {
      process.env.PATH = `${nodePath}:${process.env.PATH}`;
    }

    emit('Node.js 22 installed');
  },
};
