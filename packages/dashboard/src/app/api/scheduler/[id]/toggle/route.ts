import { NextRequest, NextResponse } from 'next/server';
import { getPool } from '../../../../../lib/db';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const pool = getPool();

  try {
    const { id } = await params;
    const { enabled } = await request.json();

    await pool.query(
      `UPDATE scheduled_tasks SET enabled = $1, updated_at = NOW() WHERE id = $2`,
      [enabled, id]
    );

    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to toggle task' },
      { status: 500 }
    );
  }
}
