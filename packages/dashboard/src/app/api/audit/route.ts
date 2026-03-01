import { NextResponse } from 'next/server';

export async function GET() {
  // In production, this queries the audit_log table
  return NextResponse.json([]);
}
