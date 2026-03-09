import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

export const STABLE_NODE = join(homedir(), 'murph', 'MurphNode.app', 'Contents', 'MacOS', 'node');

export function stableNodeWorks(): boolean {
  if (!existsSync(STABLE_NODE)) return false;
  const result = spawnSync(STABLE_NODE, ['--version'], { stdio: 'pipe' });
  return result.status === 0;
}

export function ensureStableNode(): void {
  // No-op: /usr/local/bin/node is installed by the official .pkg installer
}
