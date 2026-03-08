'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';

interface Stats {
  messagesToday: number;
  actionsToday: number;
  pendingApprovals: number;
  knowledgeDocs: number;
  channels: Record<string, string>;
}

interface AuditEntry {
  id: string;
  timestamp: string;
  action: string;
  status: string;
  channel: string;
  userId: string;
}

interface HealthCheck {
  name: string;
  status: 'pass' | 'warn' | 'fail';
  message: string;
}

interface HealthData {
  agentRunning: boolean;
  checks: HealthCheck[];
}

export default function HomePage() {
  const { data: stats } = useQuery({
    queryKey: ['stats'],
    queryFn: async () => {
      const res = await fetch('/api/stats');
      return res.json() as Promise<Stats>;
    },
  });

  const { data: recentActivity } = useQuery({
    queryKey: ['audit-recent'],
    queryFn: async () => {
      const res = await fetch('/api/audit?limit=5');
      return res.json() as Promise<AuditEntry[]>;
    },
  });

  const { data: health, refetch: refetchHealth } = useQuery({
    queryKey: ['health'],
    queryFn: async () => {
      const res = await fetch('/api/health');
      return res.json() as Promise<HealthData>;
    },
  });

  const [restarting, setRestarting] = useState(false);

  const handleRestart = async () => {
    setRestarting(true);
    try {
      await fetch('/api/agent/restart', { method: 'POST' });
      // Wait a few seconds for the agent to restart, then refresh health
      setTimeout(() => {
        refetchHealth();
        setRestarting(false);
      }, 5000);
    } catch {
      setRestarting(false);
    }
  };

  const getSystemStatus = (name: string): string => {
    if (!health) return 'unknown';

    if (name === 'Agent') {
      return health.agentRunning ? 'running' : 'disconnected';
    }

    const check = health.checks?.find(c =>
      c.name.toLowerCase().includes(name.toLowerCase())
    );
    if (!check) return 'unknown';
    return check.status === 'pass' ? 'connected' : check.status === 'warn' ? 'unknown' : 'error';
  };

  return (
    <div>
      <h2 className="text-2xl font-bold mb-6">Dashboard</h2>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatusCard title="Messages Today" value={String(stats?.messagesToday ?? '--')} />
        <StatusCard title="Actions Executed" value={String(stats?.actionsToday ?? '--')} />
        <StatusCard title="Pending Approvals" value={String(stats?.pendingApprovals ?? '0')} />
        <StatusCard title="Knowledge Docs" value={String(stats?.knowledgeDocs ?? '--')} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-zinc-900 rounded-xl border border-zinc-800 p-6">
          <h3 className="text-lg font-semibold mb-4">Recent Activity</h3>
          {!recentActivity?.length ? (
            <p className="text-zinc-500 text-sm">No recent activity.</p>
          ) : (
            <div className="space-y-2">
              {recentActivity.map((entry) => (
                <div key={entry.id} className="flex items-center justify-between py-1.5 border-b border-zinc-800/50">
                  <div className="flex items-center gap-2">
                    <span className={`px-1.5 py-0.5 rounded text-xs ${
                      entry.status === 'completed' ? 'bg-green-900 text-green-300' :
                      entry.status === 'failed' ? 'bg-red-900 text-red-300' :
                      entry.status === 'denied' ? 'bg-yellow-900 text-yellow-300' :
                      'bg-zinc-800 text-zinc-400'
                    }`}>
                      {entry.status}
                    </span>
                    <span className="text-sm font-mono">{entry.action}</span>
                  </div>
                  <span className="text-xs text-zinc-500">
                    {new Date(entry.timestamp).toLocaleTimeString()}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="bg-zinc-900 rounded-xl border border-zinc-800 p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold">System Status</h3>
            <button
              onClick={handleRestart}
              disabled={restarting}
              className="px-3 py-1.5 text-xs font-medium rounded-lg bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {restarting ? 'Restarting...' : 'Restart Agent'}
            </button>
          </div>
          <div className="space-y-3">
            <StatusRow label="Agent" status={getSystemStatus('Agent')} />
            <StatusRow label="Database" status={getSystemStatus('PostgreSQL')} />
            <StatusRow label="Ollama" status={getSystemStatus('Ollama')} />
            <StatusRow
              label="Telegram"
              status={stats?.channels?.telegram ?? 'disabled'}
            />
            <StatusRow
              label="iMessage"
              status={stats?.channels?.imessage ?? 'disabled'}
            />
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
    enabled: 'bg-green-500',
    disabled: 'bg-zinc-600',
    disconnected: 'bg-red-500',
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
