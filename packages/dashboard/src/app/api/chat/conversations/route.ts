import { NextResponse } from 'next/server';
import { getPool } from '../../../../lib/db';

export async function GET() {
  const pool = getPool();

  try {
    const result = await pool.query(`
      SELECT
        conversation_id AS id,
        MIN(content) FILTER (WHERE sender = 'user') AS preview,
        COUNT(*)::int AS message_count,
        MAX(timestamp) AS last_message_at
      FROM messages
      GROUP BY conversation_id
      ORDER BY MAX(timestamp) DESC
      LIMIT 50
    `);

    const conversations = result.rows.map((row) => ({
      id: row.id,
      preview: row.preview
        ? row.preview.length > 80
          ? row.preview.slice(0, 80) + '...'
          : row.preview
        : 'Conversation',
      messageCount: row.message_count,
      lastMessageAt: row.last_message_at,
    }));

    return NextResponse.json(conversations);
  } catch {
    return NextResponse.json([]);
  }
}
