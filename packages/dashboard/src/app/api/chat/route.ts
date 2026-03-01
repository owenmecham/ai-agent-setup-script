import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  const { message } = await request.json();

  // In production, this would call the Murph agent
  // For now, return a placeholder
  return NextResponse.json({
    response: `Echo: ${message}`,
    actions: [],
  });
}
