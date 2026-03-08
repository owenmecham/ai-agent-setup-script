import { NextResponse } from 'next/server';
import { execSync, spawn } from 'child_process';
import { existsSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

function isGwsInstalled(): boolean {
  try {
    execSync('which gws', { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

function checkAuthStatus(): { authenticated: boolean; email?: string; error?: string } {
  if (!isGwsInstalled()) {
    return { authenticated: false, error: 'gws CLI not installed' };
  }

  // Check if token file exists
  const tokenPath = join(homedir(), '.config', 'gws', 'token.json');
  if (!existsSync(tokenPath)) {
    return { authenticated: false, error: 'No token found' };
  }

  // Try a quick API call to verify the token is valid
  try {
    const result = execSync('gws gmail users getProfile --userId me 2>&1', {
      timeout: 10000,
      encoding: 'utf-8',
    });
    // Try to extract email from the response
    const emailMatch = result.match(/"emailAddress"\s*:\s*"([^"]+)"/);
    return {
      authenticated: true,
      email: emailMatch?.[1] ?? undefined,
    };
  } catch {
    return { authenticated: false, error: 'Token expired or invalid' };
  }
}

export async function GET() {
  const gwsInstalled = isGwsInstalled();
  const status = gwsInstalled ? checkAuthStatus() : { authenticated: false, error: 'gws CLI not installed' };

  return NextResponse.json({
    installed: gwsInstalled,
    authenticated: status.authenticated,
    email: status.email ?? null,
    error: status.error ?? null,
  });
}

export async function POST() {
  if (!isGwsInstalled()) {
    return NextResponse.json(
      { error: 'gws CLI not installed. Run: npm install -g @googleworkspace/cli' },
      { status: 400 },
    );
  }

  try {
    // Spawn gws auth login — it will print a URL the user needs to visit
    const proc = spawn('gws', ['auth', 'login'], {
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: true,
    });

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (data: Buffer) => { stdout += data.toString(); });
    proc.stderr.on('data', (data: Buffer) => { stderr += data.toString(); });

    const exitCode = await new Promise<number>((resolve) => {
      proc.on('close', (code) => resolve(code ?? 1));
      // Timeout after 120 seconds
      setTimeout(() => {
        proc.kill();
        resolve(1);
      }, 120000);
    });

    if (exitCode === 0) {
      return NextResponse.json({ success: true, message: 'Authentication completed' });
    }

    return NextResponse.json(
      { error: stderr || stdout || 'Authentication failed' },
      { status: 500 },
    );
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to start auth flow' },
      { status: 500 },
    );
  }
}
