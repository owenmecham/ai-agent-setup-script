import { NextRequest, NextResponse } from 'next/server';
import { getPool } from '../../../lib/db';

export async function GET(request: NextRequest) {
  const pool = getPool();
  const { searchParams } = new URL(request.url);
  const search = searchParams.get('search');

  try {
    let result;
    if (search) {
      result = await pool.query(
        `SELECT id, source, source_path, title, content_hash, metadata, created_at, updated_at
         FROM knowledge_documents
         WHERE title ILIKE $1 OR source ILIKE $1
         ORDER BY updated_at DESC
         LIMIT 50`,
        [`%${search}%`]
      );
    } else {
      result = await pool.query(
        `SELECT id, source, source_path, title, content_hash, metadata, created_at, updated_at
         FROM knowledge_documents
         ORDER BY updated_at DESC
         LIMIT 50`
      );
    }

    const documents = result.rows.map((row) => ({
      id: row.id,
      source: row.source,
      sourcePath: row.source_path,
      title: row.title,
      metadata: row.metadata,
      indexedAt: row.created_at,
      updatedAt: row.updated_at,
    }));

    return NextResponse.json(documents);
  } catch {
    return NextResponse.json([]);
  }
}
