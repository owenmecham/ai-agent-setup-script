import { spawn, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { homedir, arch } from 'node:os';
import { join } from 'node:path';

export function getMurphDir(): string {
  // If running from within the repo, use cwd
  const cwd = process.cwd();
  if (existsSync(join(cwd, 'murph.config.yaml')) || existsSync(join(cwd, 'packages', 'core'))) {
    return cwd;
  }
  return join(homedir(), 'murph');
}

// Detect Apple Silicon hardware. On ARM Macs we always prefix commands with
// `arch -arm64` to prevent Rosetta 2 conflicts with Homebrew's ARM prefix
// (/opt/homebrew). This is safe even when already running natively.
const isAppleSilicon = (() => {
  if (process.platform !== 'darwin') return false;
  const result = spawnSync('sysctl', ['-n', 'hw.optional.arm64'], { stdio: 'pipe' });
  return result.stdout?.toString().trim() === '1';
})();

export function spawnSyncSafe(
  command: string,
  args: string[],
  options?: Parameters<typeof spawnSync>[2],
): ReturnType<typeof spawnSync> {
  if (isAppleSilicon) {
    return spawnSync('arch', ['-arm64', command, ...args], options);
  }
  return spawnSync(command, args, options);
}

export function runCommand(
  command: string,
  args: string[],
  emit: (line: string) => void,
  options?: { cwd?: string },
): Promise<void> {
  return new Promise((resolve, reject) => {
    // If running under Rosetta, wrap with `arch -arm64` so brew/make work correctly
    let finalCommand = command;
    let finalArgs = args;
    if (isAppleSilicon) {
      finalCommand = 'arch';
      finalArgs = ['-arm64', command, ...args];
    }

    const proc = spawn(finalCommand, finalArgs, {
      cwd: options?.cwd,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, CI: 'true' },
    });

    proc.stdout.on('data', (data: Buffer) => {
      const lines = data.toString().split('\n').filter(l => l.trim());
      for (const line of lines) {
        emit(line);
      }
    });

    proc.stderr.on('data', (data: Buffer) => {
      const lines = data.toString().split('\n').filter(l => l.trim());
      for (const line of lines) {
        emit(line);
      }
    });

    proc.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Command "${command} ${args.join(' ')}" exited with code ${code}`));
      }
    });

    proc.on('error', (err) => {
      reject(new Error(`Failed to spawn "${command}": ${err.message}`));
    });
  });
}
