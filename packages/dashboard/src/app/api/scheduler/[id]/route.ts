import { NextRequest, NextResponse } from 'next/server';
import { getPool } from '../../../../lib/db';

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const pool = getPool();

  try {
    const { id } = await params;
    const body = await request.json();

    const sets: string[] = [];
    const values: unknown[] = [];
    let idx = 1;

    if (body.name !== undefined) { sets.push(`name = $${idx++}`); values.push(body.name); }
    if (body.cronExpression !== undefined) { sets.push(`cron_expression = $${idx++}`); values.push(body.cronExpression); }
    if (body.action !== undefined) { sets.push(`action = $${idx++}`); values.push(body.action); }
    if (body.parameters !== undefined) { sets.push(`parameters = $${idx++}`); values.push(JSON.stringify(body.parameters)); }
    if (body.enabled !== undefined) { sets.push(`enabled = $${idx++}`); values.push(body.enabled); }

    sets.push(`updated_at = NOW()`);
    values.push(id);

    await pool.query(
      `UPDATE scheduled_tasks SET ${sets.join(', ')} WHERE id = $${idx}`,
      values
    );

    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to update task' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const pool = getPool();

  try {
    const { id } = await params;
    await pool.query(`DELETE FROM scheduled_tasks WHERE id = $1`, [id]);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to delete task' },
      { status: 500 }
    );
  }
}
