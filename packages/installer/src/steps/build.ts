import type { InstallStep } from './index.js';
import { runCommand, getMurphDir } from '../util.js';

export const build: InstallStep = {
  name: 'build',
  label: 'Install Dependencies',
  description: 'Install production Node.js dependencies',
  required: true,

  async check() {
    return 'needed';
  },

  async execute(emit) {
    const cwd = getMurphDir();

    emit('Installing production dependencies...');
    await runCommand('pnpm', ['install', '--prod'], emit, { cwd });

    emit('Installing Playwright Chromium...');
    await runCommand('pnpm', ['dlx', 'playwright@latest', 'install', 'chromium'], emit, { cwd });

    emit('Dependencies installed');
  },
};
