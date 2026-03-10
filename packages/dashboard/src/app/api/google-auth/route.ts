import { NextResponse } from 'next/server';
import { execSync, spawn, type ChildProcess } from 'child_process';
import { homedir } from 'os';

// Module-level state persists between requests within the Next.js server process
let authState: {
  proc: ChildProcess;
  error: string | null;
  startedAt: number;
} | null = null;

const HOME = homedir();

function isGwsInstalled(): boolean {
  try {
    execSync('which gws', { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

function checkAuthStatus(): { authenticated: boolean; email: string | null; error?: string } {
  try {
    const result = execSync('gws gmail users.getProfile --user-id me', {
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 15000,
      encoding: 'utf-8',
    });
    const data = JSON.parse(result);
    return { authenticated: true, email: data?.emailAddress ?? null };
  } catch {
    return { authenticated: false, email: null, error: 'Not authenticated — run: pnpm murph google-auth' };
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

// GET — check auth status
export async function GET() {
  const installed = isGwsInstalled();
  const status = installed ? checkAuthStatus() : { authenticated: false, email: null, error: 'gws CLI not installed' };

  // If auth just completed, clean up the process state
  if (authState && status.authenticated) {
    cleanupAuthProcess();
  }

  // Check if auth process timed out (5 minutes)
  if (authState && Date.now() - authState.startedAt > 5 * 60 * 1000) {
    cleanupAuthProcess();
  }

  return NextResponse.json({
    installed,
    authenticated: status.authenticated,
    email: status.email ?? null,
    error: status.error ?? null,
    hasClientCredentials: true, // gws manages its own credentials
    authInProgress: authState !== null,
    authUrl: null, // gws handles browser opening internally
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

  // Kill any existing auth process
  cleanupAuthProcess();

  try {
    const proc = spawn('gws', ['auth', 'login'], {
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    authState = {
      proc,
      error: null,
      startedAt: Date.now(),
    };

    proc.on('close', (code) => {
      if (authState?.proc === proc) {
        if (code !== 0) {
          authState.error = `Auth process exited with code ${code}`;
          setTimeout(() => {
            if (authState?.proc === proc) authState = null;
          }, 30000);
        } else {
          // Success — let GET detect via checkAuthStatus()
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
        try { proc.kill(); } catch {}
        authState = null;
      }
    }, 5 * 60 * 1000);

    return NextResponse.json({
      started: true,
      authUrl: null,
      error: null,
    });
  } catch (err) {
    cleanupAuthProcess();
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to start auth flow' },
      { status: 500 },
    );
  }
}

// PUT — no-op (gws manages its own credentials, kept for API compatibility)
export async function PUT() {
  return NextResponse.json({ success: true, message: 'gws manages credentials internally. Use gws auth login.' });
}

// DELETE — cancel in-progress auth
export async function DELETE() {
  cleanupAuthProcess();
  return NextResponse.json({ success: true });
}
