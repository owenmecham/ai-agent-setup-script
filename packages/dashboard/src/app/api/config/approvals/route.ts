import { NextRequest, NextResponse } from 'next/server';
import { writeDashboardConfig, redactSecrets } from '../../../../lib/config';

const AGENT_API_URL = 'http://127.0.0.1:3140';

export async function PUT(request: NextRequest) {
  try {
    const { approval_defaults } = await request.json();

    if (!approval_defaults || typeof approval_defaults !== 'object') {
      return NextResponse.json({ error: 'approval_defaults must be an object' }, { status: 400 });
    }

    // Validate levels
    const validLevels = ['auto', 'notify', 'require'];
    for (const [action, level] of Object.entries(approval_defaults)) {
      if (!validLevels.includes(level as string)) {
        return NextResponse.json(
          { error: `Invalid level "${level}" for action "${action}". Must be one of: ${validLevels.join(', ')}` },
          { status: 400 }
        );
      }
    }

    const updates = { security: { approval_defaults } };

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

    const config = writeDashboardConfig(updates);
    return NextResponse.json(redactSecrets(config));
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to update approvals' },
      { status: 400 }
    );
  }
}
