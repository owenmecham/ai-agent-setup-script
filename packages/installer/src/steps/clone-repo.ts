import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import type { InstallStep } from './index.js';
import { runCommand, getMurphDir } from '../util.js';

const REPO_URL = 'https://github.com/owenmecham/ai-agent-setup-script.git';

export const cloneRepo: InstallStep = {
  name: 'clone-repo',
  label: 'Murph Source Code',
  description: 'Clone or update the Murph repository',
  required: true,

  async check() {
    const installDir = getMurphDir();
    return existsSync(join(installDir, '.git')) ? 'done' : 'needed';
  },

  async execute(emit) {
    const installDir = getMurphDir();

    if (existsSync(join(installDir, '.git'))) {
      emit('Updating existing installation...');
      await runCommand('git', ['-C', installDir, 'pull', '--ff-only'], emit);
    } else {
      emit('Cloning Murph repository...');
      await runCommand('git', ['clone', REPO_URL, installDir], emit);
    }

    emit(`Source code ready at ${installDir}`);
  },
};
