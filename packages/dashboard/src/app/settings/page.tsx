export default function SettingsPage() {
  return (
    <div>
      <h2 className="text-2xl font-bold mb-6">Settings</h2>

      <div className="space-y-6">
        <div className="bg-zinc-900 rounded-xl border border-zinc-800 p-6">
          <h3 className="text-lg font-semibold mb-4">Agent Configuration</h3>
          <div className="space-y-4">
            <SettingRow label="Agent Name" value="Murph" />
            <SettingRow label="Model" value="sonnet" />
            <SettingRow label="Max Budget/Message" value="$0.50" />
            <SettingRow label="Timezone" value="America/Denver" />
          </div>
        </div>

        <div className="bg-zinc-900 rounded-xl border border-zinc-800 p-6">
          <h3 className="text-lg font-semibold mb-4">Approval Defaults</h3>
          <p className="text-sm text-zinc-500 mb-4">
            Configure approval levels for each action type.
            <strong className="text-zinc-300"> require</strong> = wait for user approval,
            <strong className="text-zinc-300"> notify</strong> = execute + alert,
            <strong className="text-zinc-300"> auto</strong> = silent execution.
          </p>
          <div className="space-y-2">
            <ApprovalRow action="gmail.send" level="require" />
            <ApprovalRow action="gmail.read" level="auto" />
            <ApprovalRow action="imessage.send" level="require" />
            <ApprovalRow action="telegram.send" level="notify" />
            <ApprovalRow action="bop.*" level="require" />
            <ApprovalRow action="mcp.*" level="require" />
            <ApprovalRow action="creator.*" level="require" />
            <ApprovalRow action="knowledge.ingest" level="auto" />
          </div>
        </div>

        <div className="bg-zinc-900 rounded-xl border border-zinc-800 p-6">
          <h3 className="text-lg font-semibold mb-4">Secrets</h3>
          <p className="text-zinc-500 text-sm">
            Manage secrets via CLI: <code className="bg-zinc-800 px-1 rounded">pnpm murph secret set &lt;name&gt; &lt;value&gt;</code>
          </p>
        </div>
      </div>
    </div>
  );
}

function SettingRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between py-2 border-b border-zinc-800/50">
      <span className="text-sm text-zinc-300">{label}</span>
      <span className="text-sm text-zinc-500 font-mono">{value}</span>
    </div>
  );
}

function ApprovalRow({ action, level }: { action: string; level: string }) {
  const colors: Record<string, string> = {
    require: 'text-red-400',
    notify: 'text-yellow-400',
    auto: 'text-green-400',
  };

  return (
    <div className="flex items-center justify-between py-1.5">
      <span className="text-sm font-mono text-zinc-300">{action}</span>
      <span className={`text-sm font-mono ${colors[level] ?? 'text-zinc-500'}`}>{level}</span>
    </div>
  );
}
