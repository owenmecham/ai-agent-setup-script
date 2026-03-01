import { NextResponse } from 'next/server';

export async function GET() {
  // In production, this queries scheduled_tasks table
  return NextResponse.json([]);
}
