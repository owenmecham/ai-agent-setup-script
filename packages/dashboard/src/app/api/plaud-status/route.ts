import { NextResponse } from 'next/server';
import { execSync, spawn } from 'child_process';

function isPlaudDesktopInstalled(): boolean {
  try {
    const { existsSync } = require('fs');
    return existsSync('/Applications/PLAUD.app');
  } catch {
    return false;
  }
}

function isPlaudMcpInstalled(): boolean {
  try {
    execSync('which plaud-mcp', { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

function isUvInstalled(): boolean {
  try {
    execSync('which uv', { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

export async function GET() {
  const desktopInstalled = isPlaudDesktopInstalled();
  const mcpInstalled = isPlaudMcpInstalled();
  const uvInstalled = isUvInstalled();

  let connected = false;
  if (mcpInstalled && desktopInstalled) {
    try {
      execSync('plaud-mcp --help', { stdio: 'ignore', timeout: 5000 });
      connected = true;
    } catch {
      // plaud-mcp exists but couldn't verify connection
    }
  }

  return NextResponse.json({
    desktopInstalled,
    mcpInstalled,
    uvInstalled,
    connected,
  });
}

export async function POST() {
  if (!isUvInstalled()) {
    return NextResponse.json(
      { error: 'uv is not installed. Run: brew install uv' },
      { status: 400 },
    );
  }

  try {
    const proc = spawn(
      'uv',
      ['tool', 'install', 'plaud-mcp', '--from', 'git+https://github.com/davidlinjiahao/plaud-mcp'],
      { stdio: ['ignore', 'pipe', 'pipe'], shell: true },
    );

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (data: Buffer) => { stdout += data.toString(); });
    proc.stderr.on('data', (data: Buffer) => { stderr += data.toString(); });

    const exitCode = await new Promise<number>((resolve) => {
      proc.on('close', (code) => resolve(code ?? 1));
      setTimeout(() => {
        proc.kill();
        resolve(1);
      }, 120000);
    });

    if (exitCode === 0) {
      return NextResponse.json({ success: true, message: 'Plaud MCP installed successfully' });
    }

    return NextResponse.json(
      { error: stderr || stdout || 'Installation failed' },
      { status: 500 },
    );
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to install Plaud MCP' },
      { status: 500 },
    );
  }
}
