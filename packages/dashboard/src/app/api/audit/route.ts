import { NextRequest, NextResponse } from 'next/server';
import { getPool } from '../../../lib/db';

export async function GET(request: NextRequest) {
  const pool = getPool();
  const { searchParams } = new URL(request.url);

  const action = searchParams.get('action');
  const status = searchParams.get('status');
  const channel = searchParams.get('channel');
  const since = searchParams.get('since');
  const limit = Math.min(parseInt(searchParams.get('limit') ?? '50'), 200);
  const offset = parseInt(searchParams.get('offset') ?? '0');

  try {
    const conditions: string[] = [];
    const params: unknown[] = [];
    let paramIndex = 1;

    if (action) {
      conditions.push(`action = $${paramIndex++}`);
      params.push(action);
    }
    if (status) {
      conditions.push(`status = $${paramIndex++}`);
      params.push(status);
    }
    if (channel) {
      conditions.push(`channel = $${paramIndex++}`);
      params.push(channel);
    }
    if (since) {
      conditions.push(`timestamp >= $${paramIndex++}`);
      params.push(new Date(since));
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const result = await pool.query(
      `SELECT * FROM audit_log ${where} ORDER BY timestamp DESC LIMIT $${paramIndex++} OFFSET $${paramIndex}`,
      [...params, limit, offset]
    );

    const entries = result.rows.map((row) => ({
      id: row.id,
      timestamp: row.timestamp,
      action: row.action,
      status: row.status,
      channel: row.channel,
      conversationId: row.conversation_id,
      userId: row.user_id,
      parameters: row.parameters,
      result: row.result,
      error: row.error,
    }));

    return NextResponse.json(entries);
  } catch {
    return NextResponse.json([]);
  }
}
