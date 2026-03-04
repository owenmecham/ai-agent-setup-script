import { NextRequest, NextResponse } from 'next/server';
import { getPool } from '../../../../lib/db';

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const pool = getPool();

  try {
    const { id } = await params;

    // Delete chunks first (foreign key)
    await pool.query(`DELETE FROM knowledge_chunks WHERE document_id = $1`, [id]);
    await pool.query(`DELETE FROM knowledge_documents WHERE id = $1`, [id]);

    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to delete document' },
      { status: 500 }
    );
  }
}
