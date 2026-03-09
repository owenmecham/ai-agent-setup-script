import { NextResponse } from 'next/server';
import { execSync, spawn, type ChildProcess } from 'child_process';
import { existsSync, writeFileSync, readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

// Module-level state persists between requests within the Next.js server process
let authState: {
  proc: ChildProcess;
  url: string | null;
  error: string | null;
  startedAt: number;
  pollTimer: ReturnType<typeof setInterval> | null;
} | null = null;

const HOME = homedir();
const CRED_DIR = join(HOME, '.google_workspace_mcp', 'credentials');
const ZSHRC_PATH = join(HOME, '.zshrc');

function isUvxInstalled(): boolean {
  try {
    execSync('which uvx', { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

function hasGoogleEnvVars(): boolean {
  return !!(process.env.GOOGLE_OAUTH_CLIENT_ID && process.env.GOOGLE_OAUTH_CLIENT_SECRET);
}

function hasCredentialFiles(): boolean {
  try {
    return existsSync(CRED_DIR) && readdirSync(CRED_DIR).some(f => f.endsWith('.json'));
  } catch { return false; }
}

function checkAuthStatus(): { authenticated: boolean; error?: string } {
  if (hasCredentialFiles()) {
    return { authenticated: true };
  }
  return { authenticated: false, error: 'Not authenticated — no workspace-mcp credentials found' };
}

function cleanupAuthProcess() {
  if (authState) {
    if (authState.pollTimer) clearInterval(authState.pollTimer);
    try {
      authState.proc.kill();
    } catch {
      // already dead
    }
    authState = null;
  }
}

// GET — check auth status + poll for in-progress auth URL
export async function GET() {
  const uvxInstalled = isUvxInstalled();
  const hasCredentials = hasGoogleEnvVars();
  const status = checkAuthStatus();

  // If auth just completed, clean up the process state
  if (authState && status.authenticated) {
    cleanupAuthProcess();
  }

  // Check if auth process timed out (5 minutes)
  if (authState && Date.now() - authState.startedAt > 5 * 60 * 1000) {
    cleanupAuthProcess();
  }

  return NextResponse.json({
    installed: uvxInstalled,
    authenticated: status.authenticated,
    email: null, // workspace-mcp doesn't expose email in a simple check
    error: status.error ?? null,
    hasClientCredentials: hasCredentials,
    authInProgress: authState !== null,
    authUrl: authState?.url ?? null,
    authError: authState?.error ?? null,
  });
}

// POST — start non-blocking auth flow
export async function POST() {
  if (!isUvxInstalled()) {
    return NextResponse.json(
      { error: 'uvx not installed. Install uv first: brew install uv' },
      { status: 400 },
    );
  }

  if (!hasGoogleEnvVars()) {
    return NextResponse.json(
      { error: 'No OAuth credentials configured. Save your Client ID and Secret first.' },
      { status: 400 },
    );
  }

  // Kill any existing auth process
  cleanupAuthProcess();

  try {
    const proc = spawn('uvx', ['workspace-mcp', '--single-user', '--tool-tier', 'core'], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env },
    });

    authState = {
      proc,
      url: null,
      error: null,
      startedAt: Date.now(),
      pollTimer: null,
    };

    // Send MCP initialize + tool call to trigger OAuth flow (stdio = newline-delimited JSON-RPC)
    const sendJsonRpc = (msg: object) => {
      const json = JSON.stringify(msg);
      try { proc.stdin?.write(json + '\n'); } catch {}
    };

    setTimeout(() => {
      sendJsonRpc({
        jsonrpc: '2.0', id: 1, method: 'initialize',
        params: {
          protocolVersion: '2024-11-05',
          capabilities: {},
          clientInfo: { name: 'murph-dashboard-auth', version: '1.0.0' },
        },
      });
      setTimeout(() => {
        sendJsonRpc({ jsonrpc: '2.0', method: 'notifications/initialized' });
        setTimeout(() => {
          sendJsonRpc({
            jsonrpc: '2.0', id: 2, method: 'tools/call',
            params: { name: 'list_labels', arguments: {} },
          });
        }, 500);
      }, 1000);
    }, 3000);

    // Poll for credential files — kill server once auth completes
    const credPoll = setInterval(() => {
      if (hasCredentialFiles()) {
        cleanupAuthProcess();
      }
    }, 2000);
    authState.pollTimer = credPoll;

    const urlRegex = /https:\/\/accounts\.google\.com[^\s]+/;

    // Capture output from both streams to find the OAuth URL
    const handleData = (data: Buffer) => {
      if (!authState) return;
      const text = data.toString();
      const match = text.match(urlRegex);
      if (match && !authState.url) {
        authState.url = match[0];
        // Best-effort: open the URL in the default browser on macOS
        try {
          spawn('open', [authState.url], { stdio: 'ignore', detached: true }).unref();
        } catch {
          // not critical
        }
      }
    };

    proc.stdout?.on('data', handleData);
    proc.stderr?.on('data', handleData);

    proc.on('close', (code) => {
      if (authState?.proc === proc) {
        if (code !== 0 && !authState.url) {
          authState.error = `Auth process exited with code ${code}`;
        }
        // Don't clear authState on success — let GET detect via checkAuthStatus()
        // and clean up, so the frontend sees the transition
        if (code !== 0) {
          // Give the frontend a chance to see the error before clearing
          setTimeout(() => {
            if (authState?.proc === proc) {
              authState = null;
            }
          }, 30000);
        }
      }
    });

    proc.on('error', (err) => {
      if (authState?.proc === proc) {
        authState.error = err.message;
      }
    });

    // 5-minute overall timeout
    setTimeout(() => {
      if (authState?.proc === proc) {
        try {
          proc.kill();
        } catch {
          // already dead
        }
        authState = null;
      }
    }, 5 * 60 * 1000);

    // Wait briefly for the URL to appear before responding
    await new Promise<void>((resolve) => {
      const check = setInterval(() => {
        if (authState?.url || authState?.error) {
          clearInterval(check);
          resolve();
        }
      }, 200);
      // Give up waiting after 3 seconds — return whatever we have
      setTimeout(() => {
        clearInterval(check);
        resolve();
      }, 3000);
    });

    return NextResponse.json({
      started: true,
      authUrl: authState?.url ?? null,
      error: authState?.error ?? null,
    });
  } catch (err) {
    cleanupAuthProcess();
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to start auth flow' },
      { status: 500 },
    );
  }
}

// PUT — save OAuth app credentials (env vars in ~/.zshrc + process.env)
export async function PUT(request: Request) {
  try {
    const body = await request.json();
    const { clientId, clientSecret } = body as {
      clientId?: string;
      clientSecret?: string;
    };

    if (!clientId || !clientSecret) {
      return NextResponse.json(
        { error: 'clientId and clientSecret are required' },
        { status: 400 },
      );
    }

    // Set in current process
    process.env.GOOGLE_OAUTH_CLIENT_ID = clientId;
    process.env.GOOGLE_OAUTH_CLIENT_SECRET = clientSecret;

    // Persist to ~/.zshrc
    const envLines: Record<string, string> = {
      GOOGLE_OAUTH_CLIENT_ID: clientId,
      GOOGLE_OAUTH_CLIENT_SECRET: clientSecret,
    };

    let zshrcContent = '';
    try {
      zshrcContent = readFileSync(ZSHRC_PATH, 'utf-8');
    } catch {
      // File doesn't exist yet
    }

    for (const [key, value] of Object.entries(envLines)) {
      const exportLine = `export ${key}="${value}"`;
      const regex = new RegExp(`^export ${key}=.*$`, 'm');
      if (regex.test(zshrcContent)) {
        zshrcContent = zshrcContent.replace(regex, exportLine);
      } else {
        zshrcContent += `\n${exportLine}\n`;
      }
    }

    writeFileSync(ZSHRC_PATH, zshrcContent, 'utf-8');

    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to save credentials' },
      { status: 500 },
    );
  }
}

// DELETE — cancel in-progress auth
export async function DELETE() {
  cleanupAuthProcess();
  return NextResponse.json({ success: true });
}
