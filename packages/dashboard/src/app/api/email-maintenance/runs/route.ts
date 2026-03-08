import { NextRequest, NextResponse } from 'next/server';
import { getPool } from '../../../../lib/db';

const AGENT_API_URL = 'http://127.0.0.1:3140';

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const limit = Math.min(parseInt(url.searchParams.get('limit') ?? '10'), 100);
  const offset = parseInt(url.searchParams.get('offset') ?? '0');

  // Try agent API first
  try {
    const response = await fetch(
      `${AGENT_API_URL}/email-maintenance/runs?limit=${limit}&offset=${offset}`,
      { signal: AbortSignal.timeout(3000) },
    );
    if (response.ok) {
      const data = await response.json();
      return NextResponse.json(data);
    }
  } catch {
    // Agent not running, fall back to direct DB query
  }

  try {
    const pool = getPool();
    const countResult = await pool.query('SELECT COUNT(*) FROM email_maintenance_runs');
    const total = parseInt(countResult.rows[0].count, 10);

    const result = await pool.query(
      'SELECT * FROM email_maintenance_runs ORDER BY started_at DESC LIMIT $1 OFFSET $2',
      [limit, offset],
    );

    return NextResponse.json({ runs: result.rows, total });
  } catch {
    return NextResponse.json({ runs: [], total: 0 });
  }
}
