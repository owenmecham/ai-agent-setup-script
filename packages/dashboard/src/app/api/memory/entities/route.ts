import { NextRequest, NextResponse } from 'next/server';
import { getPool } from '../../../../lib/db';

export async function GET(request: NextRequest) {
  const pool = getPool();
  const { searchParams } = new URL(request.url);
  const search = searchParams.get('search');

  try {
    let result;
    if (search) {
      result = await pool.query(
        `SELECT * FROM entities WHERE name ILIKE $1 OR type ILIKE $1 ORDER BY last_seen DESC LIMIT 50`,
        [`%${search}%`]
      );
    } else {
      result = await pool.query(
        `SELECT * FROM entities ORDER BY last_seen DESC LIMIT 50`
      );
    }

    const entities = result.rows.map((row) => ({
      id: row.id,
      name: row.name,
      type: row.type,
      attributes: row.attributes ?? {},
      firstSeen: row.first_seen,
      lastSeen: row.last_seen,
    }));

    return NextResponse.json(entities);
  } catch {
    return NextResponse.json([]);
  }
}
