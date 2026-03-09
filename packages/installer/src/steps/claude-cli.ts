import { spawnSync } from 'node:child_process';
import type { InstallStep } from './index.js';

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

    emit('Installing Claude Code CLI (you may be prompted for your password)...');

    // /usr/local is owned by root (official Node.js .pkg installer), so npm -g needs sudo.
    // Use osascript to show the native macOS password dialog.
    const install = spawnSync('osascript', [
      '-e',
      'do shell script "npm install -g @anthropic-ai/claude-code" with administrator privileges',
    ], {
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 300_000,
    });

    if (install.status !== 0) {
      throw new Error(`Failed to install Claude Code CLI: ${install.stderr.toString()}`);
    }

    // Add npm global bin to PATH
    const npmBin = spawnSync('npm', ['prefix', '-g'], { stdio: 'pipe' });
    if (npmBin.status === 0) {
      const binDir = `${npmBin.stdout.toString().trim()}/bin`;
      process.env.PATH = `${binDir}:${process.env.PATH}`;
    }

    // Verify
    const verify = spawnSync('claude', ['--version'], { stdio: 'pipe' });
    if (verify.status === 0) {
      emit(`Claude Code CLI installed (${verify.stdout.toString().trim()})`);
    } else {
      emit('Claude Code CLI installed');
    }
  },
};
