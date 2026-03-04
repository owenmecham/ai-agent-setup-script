'use client';

import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';

interface AuditEntry {
  id: string;
  timestamp: string;
  action: string;
  status: string;
  channel: string;
  userId: string;
  parameters?: Record<string, unknown>;
}

export default function AuditPage() {
  const [actionFilter, setActionFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [channelFilter, setChannelFilter] = useState('');
  const [page, setPage] = useState(0);
  const limit = 25;

  const queryParams = new URLSearchParams();
  queryParams.set('limit', String(limit));
  queryParams.set('offset', String(page * limit));
  if (actionFilter) queryParams.set('action', actionFilter);
  if (statusFilter) queryParams.set('status', statusFilter);
  if (channelFilter) queryParams.set('channel', channelFilter);

  const { data: entries, isLoading } = useQuery({
    queryKey: ['audit-log', actionFilter, statusFilter, channelFilter, page],
    queryFn: async () => {
      const res = await fetch(`/api/audit?${queryParams}`);
      return res.json() as Promise<AuditEntry[]>;
    },
  });

  return (
    <div>
      <h2 className="text-2xl font-bold mb-6">Audit Log</h2>

      <div className="flex gap-3 mb-4">
        <input
          type="text"
          value={actionFilter}
          onChange={(e) => { setActionFilter(e.target.value); setPage(0); }}
          placeholder="Filter by action..."
          className="bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-zinc-600 w-48"
        />
        <select
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value); setPage(0); }}
          className="bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-zinc-100 focus:outline-none"
        >
          <option value="">All statuses</option>
          <option value="started">Started</option>
          <option value="completed">Completed</option>
          <option value="failed">Failed</option>
          <option value="approved">Approved</option>
          <option value="denied">Denied</option>
        </select>
        <select
          value={channelFilter}
          onChange={(e) => { setChannelFilter(e.target.value); setPage(0); }}
          className="bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-zinc-100 focus:outline-none"
        >
          <option value="">All channels</option>
          <option value="dashboard">Dashboard</option>
          <option value="telegram">Telegram</option>
          <option value="imessage">iMessage</option>
          <option value="scheduler">Scheduler</option>
          <option value="system">System</option>
        </select>
        {(actionFilter || statusFilter || channelFilter) && (
          <button
            onClick={() => { setActionFilter(''); setStatusFilter(''); setChannelFilter(''); setPage(0); }}
            className="text-sm text-zinc-500 hover:text-zinc-300"
          >
            Clear filters
          </button>
        )}
      </div>

      <div className="bg-zinc-900 rounded-xl border border-zinc-800">
        {isLoading ? (
          <p className="p-6 text-zinc-500 text-sm">Loading...</p>
        ) : !entries?.length ? (
          <p className="p-6 text-zinc-500 text-sm">No audit entries found.</p>
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
              {entries.map((entry) => (
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

      <div className="flex items-center justify-between mt-4">
        <button
          onClick={() => setPage((p) => Math.max(0, p - 1))}
          disabled={page === 0}
          className="bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 px-3 py-1 rounded text-sm"
        >
          Previous
        </button>
        <span className="text-sm text-zinc-500">Page {page + 1}</span>
        <button
          onClick={() => setPage((p) => p + 1)}
          disabled={!entries || entries.length < limit}
          className="bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 px-3 py-1 rounded text-sm"
        >
          Next
        </button>
      </div>
    </div>
  );
}
