import { NextRequest, NextResponse } from 'next/server';
import { writeDashboardConfig, loadDashboardConfig } from '../../../../lib/config';

const AGENT_API_URL = 'http://127.0.0.1:3140';

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ name: string }> }
) {
  try {
    const { name } = await params;
    const body = await request.json();

    const config = loadDashboardConfig();

    // Build config update
    let updates: Record<string, unknown>;

    if (name === 'telegram' || name === 'imessage') {
      updates = { channels: { [name]: { enabled: body.enabled } } };
    } else if (config.integrations[name] !== undefined) {
      updates = { integrations: { [name]: { ...body } } };
    } else {
      return NextResponse.json({ error: `Unknown integration: ${name}` }, { status: 404 });
    }

    // Try agent API first for hot reload
    try {
      const response = await fetch(`${AGENT_API_URL}/config`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
        signal: AbortSignal.timeout(5000),
      });
      if (response.ok) {
        return NextResponse.json({ ok: true });
      }
    } catch {
      // Agent not running, fall back to direct file write
    }

    writeDashboardConfig(updates);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to update integration' },
      { status: 400 }
    );
  }
}
