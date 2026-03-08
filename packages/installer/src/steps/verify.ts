import { accessSync, constants } from 'node:fs';
import { homedir } from 'node:os';
import type { InstallStep } from './index.js';
import { spawnSyncSafe } from '../util.js';

interface VerifyCheck {
  name: string;
  passed: boolean;
  message: string;
}

export const verify: InstallStep = {
  name: 'verify',
  label: 'Verification',
  description: 'Run post-install health checks',
  required: true,

  async check() {
    return 'needed'; // Always run verification
  },

  async execute(emit) {
    const checks: VerifyCheck[] = [];

    // PostgreSQL connection
    const pgResult = spawnSyncSafe('psql', ['-d', 'murph', '-c', 'SELECT 1;'], { stdio: 'pipe' });
    checks.push({
      name: 'PostgreSQL',
      passed: pgResult.status === 0,
      message: pgResult.status === 0 ? 'Connected' : 'Cannot connect',
    });

    // PostgreSQL extensions
    const extResult = spawnSyncSafe('psql', ['-d', 'murph', '-t', '-c',
      "SELECT string_agg(extname, ', ') FROM pg_extension WHERE extname IN ('uuid-ossp', 'vector');"],
      { stdio: 'pipe' });
    const extensions = extResult.stdout?.toString().trim() ?? '';
    checks.push({
      name: 'Extensions',
      passed: extensions.includes('vector'),
      message: extensions || 'none found',
    });

    // Ollama
    let ollamaOk = false;
    try {
      const resp = await fetch('http://localhost:11434/api/tags');
      ollamaOk = resp.ok;
    } catch { /* not running */ }
    checks.push({
      name: 'Ollama',
      passed: ollamaOk,
      message: ollamaOk ? 'Running' : 'Not responding',
    });

    // Embedding model
    const modelResult = spawnSyncSafe('ollama', ['list'], { stdio: 'pipe' });
    const hasModel = modelResult.stdout?.toString().includes('nomic-embed-text') ?? false;
    checks.push({
      name: 'Embedding model',
      passed: hasModel,
      message: hasModel ? 'nomic-embed-text available' : 'nomic-embed-text not found',
    });

    // Claude CLI
    const claudeResult = spawnSyncSafe('claude', ['--version'], { stdio: 'pipe' });
    checks.push({
      name: 'Claude CLI',
      passed: claudeResult.status === 0,
      message: claudeResult.status === 0 ? claudeResult.stdout.toString().trim() : 'Not found',
    });

    // iMessage database access — use fs.accessSync directly rather than spawning
    // sqlite3, as child processes may not inherit TCC/FDA on all macOS versions.
    const chatDbPath = `${homedir()}/Library/Messages/chat.db`;
    let imsgAccessible = false;
    try {
      accessSync(chatDbPath, constants.R_OK);
      imsgAccessible = true;
    } catch { /* FDA not granted */ }
    checks.push({
      name: 'iMessage DB',
      passed: imsgAccessible,
      message: imsgAccessible ? 'Accessible' : 'Full Disk Access needed',
    });

    // Report results
    let allPassed = true;
    for (const check of checks) {
      const icon = check.passed ? '[PASS]' : '[FAIL]';
      emit(`${icon} ${check.name}: ${check.message}`);
      if (!check.passed) allPassed = false;
    }

    if (allPassed) {
      emit('All verification checks passed!');
    } else {
      emit('Some checks failed. Run "pnpm murph doctor" for detailed diagnostics.');
    }
  },
};
