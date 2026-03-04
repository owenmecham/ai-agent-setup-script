import { NextRequest, NextResponse } from 'next/server';
import { loadDashboardConfig, writeDashboardConfig, redactSecrets } from '../../../lib/config';

const AGENT_API_URL = 'http://127.0.0.1:3140';

export async function GET() {
  // Try agent API first for live config
  try {
    const response = await fetch(`${AGENT_API_URL}/config`, {
      signal: AbortSignal.timeout(2000),
    });
    if (response.ok) {
      const data = await response.json();
      return NextResponse.json(data);
    }
  } catch {
    // Agent not running, fall back to direct file read
  }

  try {
    const config = loadDashboardConfig();
    return NextResponse.json(redactSecrets(config));
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to load config' },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest) {
  const updates = await request.json();

  // Try agent API first for hot reload
  try {
    const response = await fetch(`${AGENT_API_URL}/config`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
      signal: AbortSignal.timeout(5000),
    });
    if (response.ok) {
      const data = await response.json();
      return NextResponse.json(data);
    }
  } catch {
    // Agent not running, fall back to direct file write
  }

  try {
    const config = writeDashboardConfig(updates);
    return NextResponse.json(redactSecrets(config));
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to update config' },
      { status: 400 }
    );
  }
}
