import { NextResponse } from 'next/server';
import { getPool } from '../../../../lib/db';

export async function GET() {
  const pool = getPool();

  try {
    const result = await pool.query(
      `SELECT id, conversation_id, summary, importance, created_at
       FROM memories
       ORDER BY created_at DESC
       LIMIT 50`
    );

    const memories = result.rows.map((row) => ({
      id: row.id,
      conversationId: row.conversation_id,
      summary: row.summary,
      importance: row.importance,
      createdAt: row.created_at,
    }));

    return NextResponse.json(memories);
  } catch {
    return NextResponse.json([]);
  }
}
