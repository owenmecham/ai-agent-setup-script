import { NextResponse } from 'next/server';
import { execSync, spawn, type ChildProcess } from 'child_process';
import { existsSync, writeFileSync, mkdirSync, unlinkSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

// Module-level state persists between requests within the Next.js server process
let authState: {
  proc: ChildProcess;
  url: string | null;
  error: string | null;
  startedAt: number;
} | null = null;

const GWS_CONFIG_DIR = join(homedir(), '.config', 'gws');
const CLIENT_SECRET_PATH = join(GWS_CONFIG_DIR, 'client_secret.json');
const CREDENTIALS_PATH = join(GWS_CONFIG_DIR, 'credentials.json');

function isGwsInstalled(): boolean {
  try {
    execSync('which gws', { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

function checkAuthStatus(): { authenticated: boolean; email?: string; error?: string } {
  try {
    const result = execSync('gws gmail users getProfile --userId me 2>&1', {
      timeout: 10000,
      encoding: 'utf-8',
    });
    const emailMatch = result.match(/"emailAddress"\s*:\s*"([^"]+)"/);
    return {
      authenticated: true,
      email: emailMatch?.[1] ?? undefined,
    };
  } catch {
    return { authenticated: false, error: 'Not authenticated' };
  }
}

function cleanupAuthProcess() {
  if (authState) {
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
  const gwsInstalled = isGwsInstalled();
  const hasClientCredentials = existsSync(CLIENT_SECRET_PATH);
  const status = gwsInstalled ? checkAuthStatus() : { authenticated: false, error: 'gws CLI not installed' };

  // If auth just completed, clean up the process state
  if (authState && status.authenticated) {
    cleanupAuthProcess();
  }

  // Check if auth process timed out (5 minutes)
  if (authState && Date.now() - authState.startedAt > 5 * 60 * 1000) {
    cleanupAuthProcess();
  }

  return NextResponse.json({
    installed: gwsInstalled,
    authenticated: status.authenticated,
    email: status.email ?? null,
    error: status.error ?? null,
    hasClientCredentials,
    authInProgress: authState !== null,
    authUrl: authState?.url ?? null,
    authError: authState?.error ?? null,
  });
}

// POST — start non-blocking auth flow
export async function POST() {
  if (!isGwsInstalled()) {
    return NextResponse.json(
      { error: 'gws CLI not installed. Run: npm install -g @googleworkspace/cli' },
      { status: 400 },
    );
  }

  if (!existsSync(CLIENT_SECRET_PATH)) {
    return NextResponse.json(
      { error: 'No OAuth credentials configured. Save your Client ID and Secret first.' },
      { status: 400 },
    );
  }

  // Kill any existing auth process
  cleanupAuthProcess();

  try {
    const proc = spawn('gws', ['auth', 'login', '-s', 'drive,gmail,calendar,tasks,sheets,docs,slides'], {
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: true,
    });

    authState = {
      proc,
      url: null,
      error: null,
      startedAt: Date.now(),
    };

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

    proc.stdout.on('data', handleData);
    proc.stderr.on('data', handleData);

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

// PUT — save OAuth app credentials (client_secret.json)
export async function PUT(request: Request) {
  try {
    const body = await request.json();
    const { clientId, clientSecret, projectId } = body as {
      clientId?: string;
      clientSecret?: string;
      projectId?: string;
    };

    if (!clientId || !clientSecret) {
      return NextResponse.json(
        { error: 'clientId and clientSecret are required' },
        { status: 400 },
      );
    }

    // Write in Google Cloud Console "installed application" format
    const clientSecretData = {
      installed: {
        client_id: clientId,
        project_id: projectId || 'murph-agent',
        auth_uri: 'https://accounts.google.com/o/oauth2/auth',
        token_uri: 'https://oauth2.googleapis.com/token',
        auth_provider_x509_cert_url: 'https://www.googleapis.com/oauth2/v1/certs',
        client_secret: clientSecret,
        redirect_uris: ['http://localhost'],
      },
    };

    // Ensure config directory exists
    mkdirSync(GWS_CONFIG_DIR, { recursive: true });

    writeFileSync(CLIENT_SECRET_PATH, JSON.stringify(clientSecretData, null, 2));

    // Delete existing credentials to force re-auth
    if (existsSync(CREDENTIALS_PATH)) {
      unlinkSync(CREDENTIALS_PATH);
    }

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
