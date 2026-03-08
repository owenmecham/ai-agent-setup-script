import { spawnSync, spawn as spawnAsync } from 'node:child_process';
import type { InstallStep } from './index.js';

export const xcodeCli: InstallStep = {
  name: 'xcode-cli',
  label: 'Xcode CLI Tools',
  description: 'Install Xcode command line developer tools',
  required: true,

  async check() {
    const result = spawnSync('xcode-select', ['-p'], { stdio: 'pipe' });
    return result.status === 0 ? 'done' : 'needed';
  },

  async execute(emit) {
    const result = spawnSync('xcode-select', ['-p'], { stdio: 'pipe' });
    if (result.status === 0) {
      emit('Xcode CLI tools already installed');
      return;
    }

    emit('Triggering Xcode CLI tools install dialog...');
    spawnSync('xcode-select', ['--install'], { stdio: 'ignore' });

    emit('Waiting for installation to complete (this may take a few minutes)...');

    // Poll until xcode-select -p succeeds
    let tries = 0;
    const maxTries = 120;
    await new Promise<void>((resolve, reject) => {
      const interval = setInterval(() => {
        tries++;
        const check = spawnSync('xcode-select', ['-p'], { stdio: 'pipe' });
        if (check.status === 0) {
          clearInterval(interval);
          emit('Xcode CLI tools installed');
          resolve();
        } else if (tries >= maxTries) {
          clearInterval(interval);
          reject(new Error('Timed out waiting for Xcode CLI tools installation'));
        }
      }, 5000);
    });
  },
};
