import { NextResponse } from 'next/server';

export async function GET() {
  // In production, this queries knowledge_documents table
  return NextResponse.json([]);
}
