export default function IntegrationsPage() {
  const integrations = [
    { name: 'Telegram', status: 'disabled', description: 'Telegram bot channel' },
    { name: 'iMessage', status: 'disabled', description: 'BlueBubbles iMessage integration' },
    { name: 'BOP Framework', status: 'disabled', description: 'Agent-to-agent commerce' },
    { name: 'Gmail', status: 'disabled', description: 'Email send/receive' },
    { name: 'Google Drive', status: 'disabled', description: 'File access and management' },
    { name: 'GoHighLevel', status: 'disabled', description: 'CRM integration' },
    { name: 'HubSpot', status: 'disabled', description: 'CRM integration' },
    { name: 'Playwright', status: 'enabled', description: 'Browser automation' },
    { name: 'Cloudflare', status: 'disabled', description: 'Web deployment' },
  ];

  return (
    <div>
      <h2 className="text-2xl font-bold mb-6">Integrations</h2>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {integrations.map((integration) => (
          <div key={integration.name} className="bg-zinc-900 rounded-xl border border-zinc-800 p-4">
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-semibold">{integration.name}</h3>
              <span className={`px-2 py-0.5 rounded text-xs ${
                integration.status === 'enabled'
                  ? 'bg-green-900 text-green-300'
                  : 'bg-zinc-800 text-zinc-500'
              }`}>
                {integration.status}
              </span>
            </div>
            <p className="text-sm text-zinc-500">{integration.description}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
