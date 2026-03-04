import { NextRequest, NextResponse } from 'next/server';
import { getSecretStore } from '../../../lib/secrets';

export async function GET() {
  try {
    const store = await getSecretStore();
    const names = await store.list();
    return NextResponse.json(names);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to list secrets' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const { name, value } = await request.json();

    if (!name || !value) {
      return NextResponse.json({ error: 'name and value are required' }, { status: 400 });
    }

    const store = await getSecretStore();
    await store.set(name, value);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to store secret' },
      { status: 500 }
    );
  }
}
