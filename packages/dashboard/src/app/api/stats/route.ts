import { NextResponse } from 'next/server';
import { getPool } from '../../../lib/db';
import { loadDashboardConfig } from '../../../lib/config';

export async function GET() {
  const pool = getPool();

  try {
    const config = loadDashboardConfig();

    const [messagesResult, actionsResult, approvalsResult, knowledgeResult] = await Promise.all([
      pool.query(
        `SELECT COUNT(*) as count FROM messages WHERE timestamp >= NOW() - INTERVAL '24 hours'`
      ).catch(() => ({ rows: [{ count: 0 }] })),
      pool.query(
        `SELECT COUNT(*) as count FROM audit_log WHERE timestamp >= NOW() - INTERVAL '24 hours'`
      ).catch(() => ({ rows: [{ count: 0 }] })),
      pool.query(
        `SELECT COUNT(*) as count FROM audit_log WHERE status = 'started' AND timestamp >= NOW() - INTERVAL '5 minutes'`
      ).catch(() => ({ rows: [{ count: 0 }] })),
      pool.query(
        `SELECT COUNT(*) as count FROM knowledge_documents`
      ).catch(() => ({ rows: [{ count: 0 }] })),
    ]);

    // Channel statuses from config
    const channels = {
      telegram: config.channels.telegram.enabled ? 'enabled' : 'disabled',
      imessage: config.channels.imessage.enabled ? 'enabled' : 'disabled',
    };

    return NextResponse.json({
      messagesToday: Number(messagesResult.rows[0]?.count ?? 0),
      actionsToday: Number(actionsResult.rows[0]?.count ?? 0),
      pendingApprovals: Number(approvalsResult.rows[0]?.count ?? 0),
      knowledgeDocs: Number(knowledgeResult.rows[0]?.count ?? 0),
      channels,
    });
  } catch (err) {
    return NextResponse.json({
      messagesToday: 0,
      actionsToday: 0,
      pendingApprovals: 0,
      knowledgeDocs: 0,
      channels: { telegram: 'unknown', imessage: 'unknown' },
    });
  }
}
