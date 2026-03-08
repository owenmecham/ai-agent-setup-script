import { NextResponse } from 'next/server';
import { loadDashboardConfig } from '../../../lib/config';

const INTEGRATION_DESCRIPTIONS: Record<string, string> = {
  bop: 'BOP Framework hive mind',
  google: 'Google Workspace (Gmail, Calendar, Tasks, Drive) via MCP',
  gohighlevel: 'GoHighLevel CRM',
  hubspot: 'HubSpot CRM',
  playwright: 'Browser automation',
  cloudflare: 'Web deployment',
};

export async function GET() {
  try {
    const config = loadDashboardConfig();

    const integrations = Object.entries(config.integrations).map(([name, settings]) => ({
      name,
      enabled: settings.enabled,
      description: INTEGRATION_DESCRIPTIONS[name] ?? name,
      settings: Object.fromEntries(
        Object.entries(settings).filter(([k]) => k !== 'enabled')
      ),
    }));

    // Add channels as integrations
    integrations.unshift(
      {
        name: 'telegram',
        enabled: config.channels.telegram.enabled,
        description: 'Telegram bot channel',
        settings: {},
      },
      {
        name: 'imessage',
        enabled: config.channels.imessage.enabled,
        description: 'iMessage (direct database poller)',
        settings: {},
      },
    );

    return NextResponse.json(integrations);
  } catch (err) {
    return NextResponse.json([], { status: 500 });
  }
}
