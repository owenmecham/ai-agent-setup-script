import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import type { InstallStep } from './index.js';
import { runCommand } from '../util.js';

const CLAUDE_BIN = join(homedir(), '.claude', 'bin', 'claude');

export const claudeCli: InstallStep = {
  name: 'claude-cli',
  label: 'Claude Code CLI',
  description: 'Install the Claude Code CLI',
  required: true,

  async check() {
    // Check native install location first
    if (existsSync(CLAUDE_BIN)) {
      const result = spawnSync(CLAUDE_BIN, ['--version'], { stdio: 'pipe' });
      if (result.status === 0) return 'done';
    }
    // Fall back to PATH
    const result = spawnSync('claude', ['--version'], { stdio: 'pipe' });
    return result.status === 0 ? 'done' : 'needed';
  },

  async execute(emit) {
    // Check if already installed
    const checkPaths = [CLAUDE_BIN, 'claude'];
    for (const bin of checkPaths) {
      const check = spawnSync(bin, ['--version'], { stdio: 'pipe' });
      if (check.status === 0) {
        emit(`Claude CLI already installed (${check.stdout.toString().trim()})`);
        ensurePath(emit);
        return;
      }
    }

    emit('Installing Claude Code CLI via native installer...');

    // Use the official standalone installer — no npm/sudo needed.
    // Installs to ~/.claude/bin/ and auto-updates.
    await runCommand('bash', ['-c', 'curl -fsSL https://claude.ai/install.sh | bash'], emit);

    ensurePath(emit);

    // Verify
    const verify = spawnSync(CLAUDE_BIN, ['--version'], { stdio: 'pipe' });
    if (verify.status === 0) {
      emit(`Claude Code CLI installed (${verify.stdout.toString().trim()})`);
    } else {
      // Try PATH fallback
      const fallback = spawnSync('claude', ['--version'], { stdio: 'pipe' });
      if (fallback.status === 0) {
        emit(`Claude Code CLI installed (${fallback.stdout.toString().trim()})`);
      } else {
        throw new Error('Claude Code CLI installation failed — claude not found after install');
      }
    }
  },
};

function ensurePath(emit: (line: string) => void): void {
  const claudeBinDir = join(homedir(), '.claude', 'bin');
  if (!process.env.PATH?.includes(claudeBinDir)) {
    process.env.PATH = `${claudeBinDir}:${process.env.PATH}`;
    emit(`Added ${claudeBinDir} to PATH`);
  }
}
