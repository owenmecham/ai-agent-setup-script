import { NextRequest, NextResponse } from 'next/server';
import { getSecretStore } from '../../../../lib/secrets';

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ name: string }> }
) {
  try {
    const { name } = await params;
    const store = await getSecretStore();
    await store.delete(name);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to delete secret' },
      { status: 500 }
    );
  }
}
