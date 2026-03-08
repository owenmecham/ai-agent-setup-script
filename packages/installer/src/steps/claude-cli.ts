import { spawnSync } from 'node:child_process';
import type { InstallStep } from './index.js';
import { runCommand } from '../util.js';

export const claudeCli: InstallStep = {
  name: 'claude-cli',
  label: 'Claude Code CLI',
  description: 'Install the Claude Code CLI',
  required: true,

  async check() {
    const result = spawnSync('claude', ['--version'], { stdio: 'pipe' });
    return result.status === 0 ? 'done' : 'needed';
  },

  async execute(emit) {
    const check = spawnSync('claude', ['--version'], { stdio: 'pipe' });
    if (check.status === 0) {
      emit(`Claude CLI already installed (${check.stdout.toString().trim()})`);
      return;
    }

    emit('Installing Claude Code CLI...');
    await runCommand('npm', ['install', '-g', '@anthropic-ai/claude-code'], emit);

    // Add npm global bin to PATH
    const npmBin = spawnSync('npm', ['prefix', '-g'], { stdio: 'pipe' });
    if (npmBin.status === 0) {
      const binDir = `${npmBin.stdout.toString().trim()}/bin`;
      process.env.PATH = `${binDir}:${process.env.PATH}`;
    }

    emit('Claude Code CLI installed');
  },
};
