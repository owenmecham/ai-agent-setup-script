import { NextResponse } from 'next/server';
import { getPool } from '../../../../lib/db';

export async function GET() {
  const pool = getPool();

  try {
    const result = await pool.query(`
      SELECT
        c.id,
        c.channel,
        c.participants,
        c.created_at,
        c.updated_at,
        COUNT(m.id)::int as message_count
      FROM conversations c
      LEFT JOIN messages m ON m.conversation_id = c.id
      GROUP BY c.id
      ORDER BY c.updated_at DESC
      LIMIT 50
    `);

    const conversations = result.rows.map((row) => ({
      id: row.id,
      channel: row.channel,
      participants: row.participants ?? [],
      messageCount: row.message_count,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));

    return NextResponse.json(conversations);
  } catch {
    return NextResponse.json([]);
  }
}
