'use client';

import { useQuery } from '@tanstack/react-query';

export default function AuditPage() {
  const { data: entries, isLoading } = useQuery({
    queryKey: ['audit-log'],
    queryFn: async () => {
      const res = await fetch('/api/audit');
      return res.json();
    },
  });

  return (
    <div>
      <h2 className="text-2xl font-bold mb-6">Audit Log</h2>

      <div className="bg-zinc-900 rounded-xl border border-zinc-800">
        {isLoading ? (
          <p className="p-6 text-zinc-500 text-sm">Loading...</p>
        ) : !entries?.length ? (
          <p className="p-6 text-zinc-500 text-sm">No audit entries yet.</p>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-zinc-800 text-left">
                <th className="px-4 py-3 text-xs text-zinc-500 uppercase">Time</th>
                <th className="px-4 py-3 text-xs text-zinc-500 uppercase">Action</th>
                <th className="px-4 py-3 text-xs text-zinc-500 uppercase">Status</th>
                <th className="px-4 py-3 text-xs text-zinc-500 uppercase">Channel</th>
                <th className="px-4 py-3 text-xs text-zinc-500 uppercase">User</th>
              </tr>
            </thead>
            <tbody>
              {(entries as Array<{ id: string; timestamp: string; action: string; status: string; channel: string; userId: string }>).map((entry) => (
                <tr key={entry.id} className="border-b border-zinc-800/50 hover:bg-zinc-800/30">
                  <td className="px-4 py-3 text-sm text-zinc-400">
                    {new Date(entry.timestamp).toLocaleString()}
                  </td>
                  <td className="px-4 py-3 text-sm font-mono">{entry.action}</td>
                  <td className="px-4 py-3 text-sm">
                    <span className={`px-2 py-0.5 rounded text-xs ${
                      entry.status === 'completed' ? 'bg-green-900 text-green-300' :
                      entry.status === 'failed' ? 'bg-red-900 text-red-300' :
                      entry.status === 'denied' ? 'bg-yellow-900 text-yellow-300' :
                      'bg-zinc-800 text-zinc-400'
                    }`}>
                      {entry.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-zinc-500">{entry.channel}</td>
                  <td className="px-4 py-3 text-sm text-zinc-500">{entry.userId}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
