import { spawn } from 'node:child_process';
import { accessSync, constants } from 'node:fs';
import { dirname } from 'node:path';

export interface DoctorCheck {
  name: string;
  status: 'pass' | 'warn' | 'fail';
  message: string;
  fix?: string;
}

export interface DoctorResult {
  checks: DoctorCheck[];
  passed: number;
  warnings: number;
  failed: number;
}

const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const RED = '\x1b[31m';
const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';
const DIM = '\x1b[2m';

function icon(status: DoctorCheck['status']): string {
  switch (status) {
    case 'pass': return `${GREEN}✓${RESET}`;
    case 'warn': return `${YELLOW}!${RESET}`;
    case 'fail': return `${RED}✗${RESET}`;
  }
}

function spawnCheck(command: string, args: string[]): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    try {
      const proc = spawn(command, args, { stdio: ['pipe', 'pipe', 'pipe'] });
      let stdout = '';
      let stderr = '';
      proc.stdout.on('data', (d: Buffer) => { stdout += d.toString(); });
      proc.stderr.on('data', (d: Buffer) => { stderr += d.toString(); });
      proc.on('close', (code) => resolve({ code: code ?? 1, stdout, stderr }));
      proc.on('error', () => resolve({ code: 1, stdout: '', stderr: `Failed to spawn ${command}` }));
    } catch {
      resolve({ code: 1, stdout: '', stderr: `Command not found: ${command}` });
    }
  });
}

export async function runDoctor(): Promise<DoctorResult> {
  const checks: DoctorCheck[] = [];

  // 1. PostgreSQL — connect and verify
  try {
    const { loadConfig } = await import('./config.js');
    const config = loadConfig();
    const dbUrl = config.database.url;

    const pgResult = await spawnCheck('psql', [dbUrl, '-c', 'SELECT 1;']);
    if (pgResult.code === 0) {
      checks.push({ name: 'PostgreSQL', status: 'pass', message: 'Connected to database' });

      // Check extensions
      const extResult = await spawnCheck('psql', [
        dbUrl, '-t', '-c',
        "SELECT string_agg(extname, ', ') FROM pg_extension WHERE extname IN ('uuid-ossp', 'vector');"
      ]);
      const extensions = extResult.stdout.trim();
      if (extensions.includes('uuid-ossp') && extensions.includes('vector')) {
        checks.push({ name: 'PostgreSQL extensions', status: 'pass', message: `Extensions: ${extensions}` });
      } else {
        checks.push({
          name: 'PostgreSQL extensions',
          status: 'fail',
          message: `Missing extensions. Found: ${extensions || 'none'}`,
          fix: 'Run: psql -d murph -c \'CREATE EXTENSION IF NOT EXISTS "uuid-ossp"; CREATE EXTENSION IF NOT EXISTS "vector";\'',
        });
      }

      // Check required tables
      const tablesResult = await spawnCheck('psql', [
        dbUrl, '-t', '-c',
        "SELECT string_agg(tablename, ', ' ORDER BY tablename) FROM pg_tables WHERE schemaname = 'public';"
      ]);
      const tables = tablesResult.stdout.trim();
      const requiredTables = ['audit_log', 'messages', 'secrets'];
      const missingTables = requiredTables.filter(t => !tables.includes(t));
      if (missingTables.length === 0) {
        checks.push({ name: 'Database tables', status: 'pass', message: `Tables present` });
      } else {
        checks.push({
          name: 'Database tables',
          status: 'warn',
          message: `Missing tables: ${missingTables.join(', ')}`,
          fix: 'Run: pnpm run migrate',
        });
      }
    } else {
      checks.push({
        name: 'PostgreSQL',
        status: 'fail',
        message: 'Cannot connect to database',
        fix: `Check PostgreSQL is running: pg_isready\nVerify database URL in murph.config.yaml: ${dbUrl}`,
      });
    }
  } catch (err) {
    checks.push({
      name: 'PostgreSQL',
      status: 'fail',
      message: err instanceof Error ? err.message : 'Unknown error',
      fix: 'Ensure murph.config.yaml exists and database.url is set correctly',
    });
  }

  // 2. Ollama — HTTP check + model verification
  try {
    const { loadConfig } = await import('./config.js');
    const config = loadConfig();
    const ollamaUrl = config.embedding.ollama_url;

    const tagsResponse = await fetch(`${ollamaUrl}/api/tags`).catch(() => null);
    if (tagsResponse?.ok) {
      checks.push({ name: 'Ollama', status: 'pass', message: `Running at ${ollamaUrl}` });

      const tags = await tagsResponse.json() as { models?: Array<{ name: string }> };
      const modelName = config.embedding.model;
      const hasModel = tags.models?.some(m => m.name.startsWith(modelName));
      if (hasModel) {
        checks.push({ name: 'Embedding model', status: 'pass', message: `${modelName} available` });
      } else {
        checks.push({
          name: 'Embedding model',
          status: 'fail',
          message: `${modelName} not found`,
          fix: `Run: ollama pull ${modelName}`,
        });
      }
    } else {
      checks.push({
        name: 'Ollama',
        status: 'fail',
        message: `Not responding at ${ollamaUrl}`,
        fix: 'Start Ollama: ollama serve',
      });
    }
  } catch {
    checks.push({
      name: 'Ollama',
      status: 'fail',
      message: 'Cannot reach Ollama',
      fix: 'Start Ollama: ollama serve',
    });
  }

  // 3. Claude CLI — check version
  const claudeResult = await spawnCheck('claude', ['--version']);
  if (claudeResult.code === 0) {
    checks.push({ name: 'Claude CLI', status: 'pass', message: `Version: ${claudeResult.stdout.trim()}` });
  } else {
    checks.push({
      name: 'Claude CLI',
      status: 'fail',
      message: 'Claude CLI not found or not working',
      fix: 'Install: npm install -g @anthropic-ai/claude-code',
    });
  }

  // 4. Config — load and validate
  try {
    const { loadConfig } = await import('./config.js');
    const config = loadConfig();
    checks.push({ name: 'Config', status: 'pass', message: `Agent: ${config.agent.name}, Model: ${config.agent.model}` });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    checks.push({
      name: 'Config',
      status: 'fail',
      message: message.substring(0, 120),
      fix: 'Ensure murph.config.yaml exists in the project root with valid YAML',
    });
  }

  // 5. Secrets — check required secrets for enabled channels
  try {
    const { loadConfig } = await import('./config.js');
    const config = loadConfig();

    if (config.channels.telegram.enabled && !process.env.TELEGRAM_BOT_TOKEN) {
      try {
        const { SecretStore } = await import('@murph/security');
        const store = new SecretStore();
        await store.init();
        const secrets = await store.list();
        if (!secrets.includes('TELEGRAM_BOT_TOKEN')) {
          checks.push({
            name: 'Telegram secret',
            status: 'warn',
            message: 'TELEGRAM_BOT_TOKEN not found (Telegram is enabled)',
            fix: 'Run: pnpm murph secret set TELEGRAM_BOT_TOKEN <your-token>',
          });
        } else {
          checks.push({ name: 'Telegram secret', status: 'pass', message: 'TELEGRAM_BOT_TOKEN set' });
        }
      } catch {
        checks.push({ name: 'Telegram secret', status: 'warn', message: 'Could not check secrets store' });
      }
    }

    if (config.channels.imessage.enabled && !process.env.BLUEBUBBLES_PASSWORD) {
      try {
        const { SecretStore } = await import('@murph/security');
        const store = new SecretStore();
        await store.init();
        const secrets = await store.list();
        if (!secrets.includes('BLUEBUBBLES_PASSWORD')) {
          checks.push({
            name: 'iMessage secret',
            status: 'warn',
            message: 'BLUEBUBBLES_PASSWORD not found (iMessage is enabled)',
            fix: 'Run: pnpm murph secret set BLUEBUBBLES_PASSWORD <your-password>',
          });
        } else {
          checks.push({ name: 'iMessage secret', status: 'pass', message: 'BLUEBUBBLES_PASSWORD set' });
        }
      } catch {
        checks.push({ name: 'iMessage secret', status: 'warn', message: 'Could not check secrets store' });
      }
    }
  } catch {
    // Config loading failed — already reported above
  }

  // 6. Log file — verify writable
  try {
    const { loadConfig } = await import('./config.js');
    const config = loadConfig();
    const logFile = config.logging.file.replace('~', process.env.HOME ?? '');
    const logDir = dirname(logFile);
    try {
      accessSync(logDir, constants.W_OK);
      checks.push({ name: 'Log directory', status: 'pass', message: `Writable: ${logDir}` });
    } catch {
      checks.push({
        name: 'Log directory',
        status: 'warn',
        message: `Not writable: ${logDir}`,
        fix: `Create directory: mkdir -p ${logDir}`,
      });
    }
  } catch {
    // Config loading failed — skip
  }

  const passed = checks.filter(c => c.status === 'pass').length;
  const warnings = checks.filter(c => c.status === 'warn').length;
  const failed = checks.filter(c => c.status === 'fail').length;

  return { checks, passed, warnings, failed };
}

export function printDoctorResult(result: DoctorResult): void {
  console.log('');
  console.log(`${BOLD}Murph Doctor${RESET}`);
  console.log('─'.repeat(60));

  for (const check of result.checks) {
    console.log(`  ${icon(check.status)} ${BOLD}${check.name}${RESET}`);
    console.log(`    ${DIM}${check.message}${RESET}`);
    if (check.fix) {
      console.log(`    ${YELLOW}Fix: ${check.fix}${RESET}`);
    }
  }

  console.log('');
  console.log('─'.repeat(60));
  console.log(
    `  ${GREEN}${result.passed} passed${RESET}` +
    (result.warnings > 0 ? `  ${YELLOW}${result.warnings} warnings${RESET}` : '') +
    (result.failed > 0 ? `  ${RED}${result.failed} failed${RESET}` : ''),
  );
  console.log('');
}
