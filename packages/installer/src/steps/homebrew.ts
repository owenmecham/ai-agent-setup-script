import { existsSync } from 'node:fs';
import type { InstallStep } from './index.js';
import { runCommand, spawnSyncSafe } from '../util.js';

export const homebrew: InstallStep = {
  name: 'homebrew',
  label: 'Homebrew',
  description: 'Install the Homebrew package manager',
  required: true,

  async check() {
    const result = spawnSyncSafe('brew', ['--version'], { stdio: 'pipe' });
    return result.status === 0 ? 'done' : 'needed';
  },

  async execute(emit) {
    const brewCheck = spawnSyncSafe('brew', ['--version'], { stdio: 'pipe' });
    if (brewCheck.status === 0) {
      emit('Homebrew already installed');
      return;
    }

    emit('Installing Homebrew...');
    await runCommand(
      '/bin/bash',
      ['-c', 'NONINTERACTIVE=1 $(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)'],
      emit,
    );

    // Add brew to current PATH
    if (existsSync('/opt/homebrew/bin/brew')) {
      process.env.PATH = `/opt/homebrew/bin:/opt/homebrew/sbin:${process.env.PATH}`;
    } else if (existsSync('/usr/local/bin/brew')) {
      process.env.PATH = `/usr/local/bin:${process.env.PATH}`;
    }

    emit('Homebrew installed');
  },
};
