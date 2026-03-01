export default function HomePage() {
  return (
    <div>
      <h2 className="text-2xl font-bold mb-6">Dashboard</h2>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatusCard title="Messages Today" value="--" />
        <StatusCard title="Actions Executed" value="--" />
        <StatusCard title="Pending Approvals" value="0" />
        <StatusCard title="Knowledge Docs" value="--" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-zinc-900 rounded-xl border border-zinc-800 p-6">
          <h3 className="text-lg font-semibold mb-4">Recent Activity</h3>
          <p className="text-zinc-500 text-sm">No recent activity.</p>
        </div>

        <div className="bg-zinc-900 rounded-xl border border-zinc-800 p-6">
          <h3 className="text-lg font-semibold mb-4">System Status</h3>
          <div className="space-y-3">
            <StatusRow label="Agent" status="running" />
            <StatusRow label="Database" status="connected" />
            <StatusRow label="Ollama" status="unknown" />
            <StatusRow label="Telegram" status="disabled" />
            <StatusRow label="iMessage" status="disabled" />
          </div>
        </div>
      </div>
    </div>
  );
}

function StatusCard({ title, value }: { title: string; value: string }) {
  return (
    <div className="bg-zinc-900 rounded-xl border border-zinc-800 p-4">
      <p className="text-xs text-zinc-500 uppercase tracking-wide">{title}</p>
      <p className="text-2xl font-bold mt-1">{value}</p>
    </div>
  );
}

function StatusRow({ label, status }: { label: string; status: string }) {
  const colors: Record<string, string> = {
    running: 'bg-green-500',
    connected: 'bg-green-500',
    disabled: 'bg-zinc-600',
    unknown: 'bg-yellow-500',
    error: 'bg-red-500',
  };

  return (
    <div className="flex items-center justify-between">
      <span className="text-sm text-zinc-300">{label}</span>
      <div className="flex items-center gap-2">
        <div className={`w-2 h-2 rounded-full ${colors[status] ?? 'bg-zinc-600'}`} />
        <span className="text-xs text-zinc-500 capitalize">{status}</span>
      </div>
    </div>
  );
}
