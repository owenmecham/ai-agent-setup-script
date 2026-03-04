import { NextResponse } from 'next/server';

const AGENT_API_URL = 'http://127.0.0.1:3140';

export async function GET() {
  try {
    const response = await fetch(`${AGENT_API_URL}/health`, {
      signal: AbortSignal.timeout(5000),
    });

    if (response.ok) {
      const data = await response.json();
      return NextResponse.json({ agentRunning: true, ...data });
    }

    return NextResponse.json({ agentRunning: false, checks: [] });
  } catch {
    return NextResponse.json({ agentRunning: false, checks: [] });
  }
}
