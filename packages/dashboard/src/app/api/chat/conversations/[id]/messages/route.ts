import { NextRequest, NextResponse } from 'next/server';
import { getPool } from '../../../../../../lib/db';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const pool = getPool();

  try {
    const result = await pool.query(
      `SELECT id, conversation_id, sender, content, timestamp
       FROM messages
       WHERE conversation_id = $1
       ORDER BY timestamp ASC
       LIMIT 200`,
      [id],
    );

    const messages = result.rows.map((row) => ({
      id: row.id,
      role: row.sender === 'user' ? 'user' : 'assistant',
      content: row.content,
      timestamp: row.timestamp,
    }));

    return NextResponse.json(messages);
  } catch {
    return NextResponse.json([]);
  }
}
