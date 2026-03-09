import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync, linkSync, copyFileSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import type { InstallStep } from './index.js';

const APP_NAME = 'MurphNode.app';
const BUNDLE_ID = 'com.murph.node';

function appDir(): string {
  return join(homedir(), 'murph', APP_NAME);
}

function macOSDir(): string {
  return join(appDir(), 'Contents', 'MacOS');
}

function nodeBinaryPath(): string {
  return join(macOSDir(), 'node');
}

function infoPlistPath(): string {
  return join(appDir(), 'Contents', 'Info.plist');
}

const INFO_PLIST = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
  "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleIdentifier</key>
  <string>${BUNDLE_ID}</string>
  <key>CFBundleName</key>
  <string>MurphNode</string>
  <key>CFBundleExecutable</key>
  <string>node</string>
  <key>CFBundleVersion</key>
  <string>1.0</string>
  <key>CFBundlePackageType</key>
  <string>APPL</string>
</dict>
</plist>`;

/** Find the source node binary — prefer /usr/local/bin/node, fall back to which. */
function findSourceNode(): string {
  if (existsSync('/usr/local/bin/node')) return '/usr/local/bin/node';
  try {
    const result = spawnSync('which', ['node'], { stdio: 'pipe' });
    if (result.status === 0) return result.stdout.toString().trim();
  } catch { /* ignore */ }
  return '/usr/local/bin/node';
}

export const nodeAppBundle: InstallStep = {
  name: 'node-app-bundle',
  label: 'MurphNode.app Bundle',
  description: 'Wrap node in a .app bundle for Full Disk Access',
  required: true,

  async check() {
    const binary = nodeBinaryPath();
    if (!existsSync(binary)) return 'needed';
    const result = spawnSync(binary, ['--version'], { stdio: 'pipe', timeout: 5000 });
    if (result.status !== 0) return 'needed';
    // Also check that Info.plist exists
    if (!existsSync(infoPlistPath())) return 'needed';
    return 'done';
  },

  async execute(emit) {
    const sourceNode = findSourceNode();
    if (!existsSync(sourceNode)) {
      throw new Error(`Node binary not found at ${sourceNode}. Run the Node.js install step first.`);
    }

    emit(`Creating ${APP_NAME} bundle...`);

    // Create directory structure
    const macosDir = macOSDir();
    mkdirSync(macosDir, { recursive: true });

    // Write Info.plist
    writeFileSync(infoPlistPath(), INFO_PLIST, 'utf-8');
    emit('Wrote Info.plist');

    // Link or copy node binary
    const dest = nodeBinaryPath();

    // Remove existing binary if present (to refresh on node upgrades)
    if (existsSync(dest)) {
      try {
        const { unlinkSync } = await import('node:fs');
        unlinkSync(dest);
      } catch { /* ignore */ }
    }

    // Try hardlink first (same inode = FDA covers both paths)
    try {
      linkSync(sourceNode, dest);
      emit(`Hardlinked ${sourceNode} → ${dest}`);
    } catch {
      // Hardlink fails on cross-device — fall back to copy
      copyFileSync(sourceNode, dest);
      // Ensure executable
      const { chmodSync } = await import('node:fs');
      chmodSync(dest, 0o755);
      emit(`Copied ${sourceNode} → ${dest} (cross-device fallback)`);
    }

    // Verify the bundled binary works
    const verify = spawnSync(dest, ['--version'], { stdio: 'pipe', timeout: 5000 });
    if (verify.status !== 0) {
      throw new Error(`Bundled node binary failed to execute: ${verify.stderr?.toString()}`);
    }

    emit(`${APP_NAME} ready — node ${verify.stdout.toString().trim()}`);
  },
};
