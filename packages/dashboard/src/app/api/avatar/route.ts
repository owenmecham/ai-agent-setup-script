import { NextRequest, NextResponse } from 'next/server';
import { existsSync, unlinkSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

const AVATAR_PATH = join(homedir(), '.murph', 'agent-avatar.png');
const MURPH_DIR = join(homedir(), '.murph');

export async function GET() {
  const hasCustom = existsSync(AVATAR_PATH);
  return NextResponse.json({
    hasCustom,
    ...(hasCustom ? { timestamp: Date.now() } : {}),
  });
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('avatar') as File | null;
    if (!file) {
      return NextResponse.json({ error: 'No avatar file provided' }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    if (!existsSync(MURPH_DIR)) {
      mkdirSync(MURPH_DIR, { recursive: true });
    }
    writeFileSync(AVATAR_PATH, buffer);

    return NextResponse.json({ success: true, timestamp: Date.now() });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to upload avatar' },
      { status: 500 },
    );
  }
}

export async function DELETE() {
  try {
    if (existsSync(AVATAR_PATH)) {
      unlinkSync(AVATAR_PATH);
    }
    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to delete avatar' },
      { status: 500 },
    );
  }
}
