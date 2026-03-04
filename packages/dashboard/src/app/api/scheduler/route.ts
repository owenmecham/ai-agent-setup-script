import { NextRequest, NextResponse } from 'next/server';
import { getPool } from '../../../lib/db';

export async function GET() {
  const pool = getPool();

  try {
    const result = await pool.query(
      `SELECT * FROM scheduled_tasks ORDER BY created_at DESC`
    );

    const tasks = result.rows.map((row) => ({
      id: row.id,
      name: row.name,
      cronExpression: row.cron_expression,
      action: row.action,
      parameters: row.parameters ?? {},
      channel: row.channel,
      conversationId: row.conversation_id,
      enabled: row.enabled,
      lastRunAt: row.last_run_at,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));

    return NextResponse.json(tasks);
  } catch {
    return NextResponse.json([]);
  }
}

export async function POST(request: NextRequest) {
  const pool = getPool();

  try {
    const { name, cronExpression, action, parameters, channel, enabled } = await request.json();

    if (!name || !cronExpression || !action) {
      return NextResponse.json(
        { error: 'name, cronExpression, and action are required' },
        { status: 400 }
      );
    }

    const result = await pool.query(
      `INSERT INTO scheduled_tasks (name, cron_expression, action, parameters, channel, enabled)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [name, cronExpression, action, JSON.stringify(parameters ?? {}), channel ?? null, enabled ?? true]
    );

    const row = result.rows[0];
    return NextResponse.json({
      id: row.id,
      name: row.name,
      cronExpression: row.cron_expression,
      action: row.action,
      parameters: row.parameters,
      enabled: row.enabled,
      createdAt: row.created_at,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to create task' },
      { status: 500 }
    );
  }
}
