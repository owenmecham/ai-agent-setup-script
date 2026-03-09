import { spawnSync } from 'node:child_process';
import { existsSync, unlinkSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import type { InstallStep } from './index.js';

const NODE_VERSION = 'v22.15.0';
const PKG_URL = `https://nodejs.org/dist/${NODE_VERSION}/node-${NODE_VERSION}.pkg`;
const PKG_PATH = `/tmp/node-${NODE_VERSION}.pkg`;

export const nodejs: InstallStep = {
  name: 'nodejs',
  label: 'Node.js 22+',
  description: 'Install Node.js 22+ (official installer)',
  required: true,

  async check() {
    // Try node on PATH first
    const result = spawnSync('node', ['--version'], { stdio: 'pipe' });
    if (result.status === 0) {
      const major = parseInt(result.stdout.toString().trim().replace('v', '').split('.')[0], 10);
      if (major >= 22) return 'done';
    }
    // Fallback: check /usr/local/bin/node directly (PATH may not include it yet)
    const fallback = spawnSync('/usr/local/bin/node', ['--version'], { stdio: 'pipe' });
    if (fallback.status === 0) {
      const major = parseInt(fallback.stdout.toString().trim().replace('v', '').split('.')[0], 10);
      if (major >= 22) return 'done';
    }
    return 'needed';
  },

  async execute(emit) {
    // Check if already installed
    const nodeCheck = spawnSync('/usr/local/bin/node', ['--version'], { stdio: 'pipe' });
    if (nodeCheck.status === 0) {
      const major = parseInt(nodeCheck.stdout.toString().trim().replace('v', '').split('.')[0], 10);
      if (major >= 22) {
        emit(`Node.js ${nodeCheck.stdout.toString().trim()} already installed at /usr/local/bin/node`);
        return;
      }
    }

    // Download .pkg
    emit(`Downloading Node.js ${NODE_VERSION}...`);
    const download = spawnSync('curl', ['-fsSL', PKG_URL, '-o', PKG_PATH], {
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 120_000,
    });
    if (download.status !== 0) {
      throw new Error(`Failed to download Node.js: ${download.stderr.toString()}`);
    }

    // Install via osascript (shows native macOS password dialog)
    emit('Installing Node.js (you may be prompted for your password)...');
    const install = spawnSync('osascript', [
      '-e',
      `do shell script "installer -pkg '${PKG_PATH}' -target /" with administrator privileges`,
    ], {
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 120_000,
    });
    if (install.status !== 0) {
      // Clean up downloaded .pkg on failure
      try { unlinkSync(PKG_PATH); } catch { /* ignore */ }
      throw new Error(`Failed to install Node.js: ${install.stderr.toString()}`);
    }

    // Clean up downloaded .pkg
    try { unlinkSync(PKG_PATH); } catch { /* ignore */ }

    // Verify installation
    const verify = spawnSync('/usr/local/bin/node', ['--version'], { stdio: 'pipe' });
    if (verify.status !== 0) {
      throw new Error('Node.js installation failed: /usr/local/bin/node not found after install');
    }

    // Ensure /usr/local/bin is in PATH for subsequent steps
    if (!process.env.PATH?.includes('/usr/local/bin')) {
      process.env.PATH = `/usr/local/bin:${process.env.PATH}`;
    }

    // Clean up legacy ~/murph/bin/node if it exists
    const legacyNode = join(homedir(), 'murph', 'bin', 'node');
    if (existsSync(legacyNode)) {
      try { unlinkSync(legacyNode); } catch { /* ignore */ }
      emit('Cleaned up legacy ~/murph/bin/node');
    }

    emit(`Node.js ${verify.stdout.toString().trim()} installed to /usr/local/bin/node`);
  },
};
