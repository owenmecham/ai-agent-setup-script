import { execSync, spawnSync } from 'node:child_process';
import { writeFileSync, unlinkSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

const LAUNCH_AGENTS_DIR = join(homedir(), 'Library', 'LaunchAgents');

function ensureLaunchAgentsDir(): void {
  if (!existsSync(LAUNCH_AGENTS_DIR)) {
    mkdirSync(LAUNCH_AGENTS_DIR, { recursive: true });
  }
}

function plistPath(label: string): string {
  return join(LAUNCH_AGENTS_DIR, `${label}.plist`);
}

export function installAgent(label: string, plistContent: string): void {
  ensureLaunchAgentsDir();
  const path = plistPath(label);

  // Unload first if already loaded
  if (isLoaded(label)) {
    spawnSync('launchctl', ['unload', path], { stdio: 'ignore' });
  }

  writeFileSync(path, plistContent, 'utf-8');
  spawnSync('launchctl', ['load', path], { stdio: 'inherit' });
}

export function uninstallAgent(label: string): void {
  const path = plistPath(label);
  if (existsSync(path)) {
    spawnSync('launchctl', ['unload', path], { stdio: 'ignore' });
    unlinkSync(path);
  }
}

export function startAgent(label: string): void {
  spawnSync('launchctl', ['start', label], { stdio: 'inherit' });
}

export function stopAgent(label: string): void {
  spawnSync('launchctl', ['stop', label], { stdio: 'inherit' });
}

export function isLoaded(label: string): boolean {
  const result = spawnSync('launchctl', ['list', label], {
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  return result.status === 0;
}

export function isRunning(label: string): boolean {
  const result = spawnSync('launchctl', ['list', label], {
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  if (result.status !== 0) return false;

  // Parse output: first column is PID (or '-' if not running)
  const stdout = result.stdout.toString();
  const lines = stdout.trim().split('\n');
  // launchctl list <label> outputs: "PID\tStatus\tLabel" or similar
  // If PID is '-' or '0', it's not running
  if (lines.length > 0) {
    const pid = lines[0].split('\t')[0]?.trim();
    return pid !== '-' && pid !== '' && pid !== '0';
  }
  return false;
}

export function getAgentPID(label: string): number | null {
  const result = spawnSync('launchctl', ['list', label], {
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  if (result.status !== 0) return null;

  const stdout = result.stdout.toString();
  const match = stdout.match(/^\s*"PID"\s*=\s*(\d+)/m);
  if (match) return parseInt(match[1], 10);

  // Fallback: first field of output
  const pid = stdout.trim().split('\t')[0]?.trim();
  if (pid && pid !== '-' && /^\d+$/.test(pid)) {
    return parseInt(pid, 10);
  }
  return null;
}

export function buildAgentPlist(murphDir: string): string {
  const home = homedir();
  const logDir = join(home, '.murph');
  if (!existsSync(logDir)) {
    mkdirSync(logDir, { recursive: true });
  }

  // Build a PATH that includes all common locations for Homebrew, pnpm, etc.
  const pathParts = [
    join(murphDir, 'node_modules', '.bin'), // project-local binaries (tsx, etc.)
    '/usr/local/bin',
    '/opt/homebrew/bin',
    '/opt/homebrew/sbin',
    '/usr/bin',
    '/bin',
    '/usr/sbin',
    '/sbin',
    join(home, 'Library/pnpm'),
    join(home, '.local/bin'),
    '/opt/homebrew/opt/postgresql@16/bin',
  ];

  // Prefer node inside MurphNode.app (FDA-compatible), fall back to /usr/local/bin/node
  const appNodePath = join(murphDir, 'MurphNode.app', 'Contents', 'MacOS', 'node');
  const nodePath = existsSync(appNodePath) ? appNodePath : '/usr/local/bin/node';

  const fullPath = pathParts.join(':');

  // Capture Claude/Vertex auth env vars from current environment or shell profile
  const claudeEnvKeys = [
    'CLAUDE_CODE_USE_VERTEX',
    'ANTHROPIC_VERTEX_PROJECT_ID',
    'ANTHROPIC_VERTEX_REGION',
    'ANTHROPIC_API_KEY',
    'CLAUDE_API_KEY',
    'GOOGLE_APPLICATION_CREDENTIALS',
    'GOOGLE_OAUTH_CLIENT_ID',       // workspace-mcp
    'GOOGLE_OAUTH_CLIENT_SECRET',   // workspace-mcp
  ];

  let claudeEnvEntries = '';
  for (const key of claudeEnvKeys) {
    const value = process.env[key];
    if (value) {
      claudeEnvEntries += `\n    <key>${key}</key>\n    <string>${value}</string>`;
    }
  }

  // If not in current env, try sourcing from shell profile
  if (!claudeEnvEntries) {
    try {
      const shellVars = execSync(
        'bash -c "source ~/.zshrc 2>/dev/null || source ~/.bash_profile 2>/dev/null; env"',
        { encoding: 'utf-8' },
      );
      for (const key of claudeEnvKeys) {
        const match = shellVars.match(new RegExp(`^${key}=(.+)$`, 'm'));
        if (match) {
          claudeEnvEntries += `\n    <key>${key}</key>\n    <string>${match[1]}</string>`;
        }
      }
    } catch {
      // Best-effort
    }
  }

  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.murph.agent</string>

  <key>ProgramArguments</key>
  <array>
    <string>${nodePath}</string>
    <string>packages/core/dist/cli.js</string>
    <string>start</string>
  </array>

  <key>WorkingDirectory</key>
  <string>${murphDir}</string>

  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key>
    <string>${fullPath}</string>
    <key>HOME</key>
    <string>${home}</string>
    <key>PNPM_HOME</key>
    <string>${home}/Library/pnpm</string>${claudeEnvEntries}
  </dict>

  <key>KeepAlive</key>
  <true/>

  <key>RunAtLoad</key>
  <true/>

  <key>StandardOutPath</key>
  <string>${logDir}/agent.stdout.log</string>

  <key>StandardErrorPath</key>
  <string>${logDir}/agent.stderr.log</string>

  <key>ProcessType</key>
  <string>Interactive</string>

  <key>ThrottleInterval</key>
  <integer>5</integer>
</dict>
</plist>`;
}

export const AGENT_LABEL = 'com.murph.agent';
