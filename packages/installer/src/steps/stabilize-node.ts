import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';

export const STABLE_NODE = '/usr/local/bin/node';

export function stableNodeWorks(): boolean {
  if (!existsSync(STABLE_NODE)) return false;
  const result = spawnSync(STABLE_NODE, ['--version'], { stdio: 'pipe' });
  return result.status === 0;
}

export function ensureStableNode(): void {
  // No-op: /usr/local/bin/node is installed by the official .pkg installer
}
