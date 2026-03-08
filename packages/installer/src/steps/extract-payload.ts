import { existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { InstallStep } from './index.js';
import { runCommand } from '../util.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

function findPayload(): string | null {
  // Look for payload in .app Resources, then relative to installer dist
  const candidates = [
    // Inside .app bundle: Contents/Resources/murph-payload.tar.gz
    join(__dirname, '..', '..', '..', 'Resources', 'murph-payload.tar.gz'),
    // Next to the installer build output
    join(__dirname, '..', '..', 'build', 'murph-payload.tar.gz'),
    // Repo root (dev/testing)
    join(__dirname, '..', '..', '..', '..', 'packages', 'installer', 'build', 'murph-payload.tar.gz'),
  ];

  for (const p of candidates) {
    if (existsSync(p)) return p;
  }
  return null;
}

const INSTALL_DIR = join(process.env.HOME ?? '/tmp', 'murph');

export const extractPayload: InstallStep = {
  name: 'extract-payload',
  label: 'Extract Murph',
  description: 'Extract pre-built Murph files to ~/murph',
  required: true,

  async check() {
    // Check if the install dir has the core dist (already extracted)
    return existsSync(join(INSTALL_DIR, 'packages', 'core', 'dist', 'cli.js'))
      ? 'done'
      : 'needed';
  },

  async execute(emit) {
    const payloadPath = findPayload();
    if (!payloadPath) {
      throw new Error(
        'Payload not found. The installer may be incomplete — please re-download.',
      );
    }

    emit(`Found payload: ${payloadPath}`);

    if (!existsSync(INSTALL_DIR)) {
      mkdirSync(INSTALL_DIR, { recursive: true });
    }

    emit(`Extracting to ${INSTALL_DIR}...`);
    await runCommand('tar', ['xzf', payloadPath, '-C', INSTALL_DIR], emit);

    emit('Extraction complete');
  },
};
