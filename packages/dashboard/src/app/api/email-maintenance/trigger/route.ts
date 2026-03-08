import { NextRequest, NextResponse } from 'next/server';

const AGENT_API_URL = 'http://127.0.0.1:3140';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const dryRun = body.dry_run ?? false;

    const response = await fetch(`${AGENT_API_URL}/email-maintenance/trigger`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dry_run: dryRun }),
      signal: AbortSignal.timeout(120000),
    });

    if (response.ok) {
      const data = await response.json();
      return NextResponse.json(data);
    }

    return NextResponse.json(
      { error: 'Failed to trigger email maintenance run' },
      { status: response.status },
    );
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Agent not reachable' },
      { status: 503 },
    );
  }
}
