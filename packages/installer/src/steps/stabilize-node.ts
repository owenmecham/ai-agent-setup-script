import { spawnSync } from 'node:child_process';
import { copyFileSync, chmodSync, existsSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import type { InstallStep } from './index.js';

const STABLE_DIR = join(homedir(), 'murph', 'bin');
const STABLE_NODE = join(STABLE_DIR, 'node');

function stableNodeWorks(): boolean {
  if (!existsSync(STABLE_NODE)) return false;
  const result = spawnSync(STABLE_NODE, ['--version'], { stdio: 'pipe' });
  return result.status === 0;
}

function resolveSourceNode(): string | null {
  // Try `which node` first
  const which = spawnSync('which', ['node'], { stdio: 'pipe' });
  if (which.status === 0) {
    const p = which.stdout.toString().trim();
    if (p && existsSync(p)) return p;
  }

  // Fallback: source nvm and find node
  const nvmDir = join(homedir(), '.nvm');
  if (existsSync(join(nvmDir, 'nvm.sh'))) {
    const result = spawnSync('/bin/bash', ['-c', `. "${nvmDir}/nvm.sh" && which node`], {
      stdio: 'pipe',
      env: { ...process.env, NVM_DIR: nvmDir },
    });
    if (result.status === 0) {
      const p = result.stdout.toString().trim();
      if (p && existsSync(p)) return p;
    }
  }

  return null;
}

export const stabilizeNode: InstallStep = {
  name: 'stabilize-node',
  label: 'Stable Node Binary',
  description: 'Copy node to ~/murph/bin/node for Full Disk Access compatibility',
  required: false,

  async check() {
    return stableNodeWorks() ? 'done' : 'needed';
  },

  async execute(emit) {
    const source = resolveSourceNode();
    if (!source) {
      throw new Error('Cannot find node binary. Ensure Node.js is installed.');
    }

    emit(`Source node: ${source}`);

    if (!existsSync(STABLE_DIR)) {
      mkdirSync(STABLE_DIR, { recursive: true });
      emit(`Created ${STABLE_DIR}`);
    }

    copyFileSync(source, STABLE_NODE);
    chmodSync(STABLE_NODE, 0o755);
    emit(`Copied to ${STABLE_NODE}`);

    // Verify the copy works
    const verify = spawnSync(STABLE_NODE, ['--version'], { stdio: 'pipe' });
    if (verify.status !== 0) {
      throw new Error(`Copied binary failed verification: ${verify.stderr?.toString()}`);
    }

    emit(`Verified: ${STABLE_NODE} → ${verify.stdout.toString().trim()}`);
  },
};
