import { NextResponse } from 'next/server';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

const AVATAR_PATH = join(homedir(), '.murph', 'agent-avatar.png');

export async function GET() {
  if (!existsSync(AVATAR_PATH)) {
    return NextResponse.json({ error: 'No custom avatar' }, { status: 404 });
  }

  const buffer = readFileSync(AVATAR_PATH);
  return new NextResponse(buffer, {
    headers: {
      'Content-Type': 'image/png',
      'Cache-Control': 'no-cache',
    },
  });
}
