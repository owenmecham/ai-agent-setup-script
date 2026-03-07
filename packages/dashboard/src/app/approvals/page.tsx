'use client';

import { useEffect, useState, useCallback } from 'react';

interface ApprovalRequest {
  id: string;
  action: string;
  parameters: Record<string, unknown>;
  requestedAt: string;
}

export default function ApprovalsPage() {
  const [approvals, setApprovals] = useState<ApprovalRequest[]>([]);
  const [connected, setConnected] = useState(false);
  const [resolving, setResolving] = useState<Set<string>>(new Set());

  useEffect(() => {
    const eventSource = new EventSource('/api/approvals');

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);

        if (data.type === 'connected') {
          setConnected(true);
        } else if (data.type === 'disconnected') {
          setConnected(false);
        } else if (data.type === 'approval') {
          setApprovals((prev) => {
            // Avoid duplicates
            if (prev.some((a) => a.id === data.id)) return prev;
            return [...prev, {
              id: data.id,
              action: data.action,
              parameters: data.parameters ?? {},
              requestedAt: data.requestedAt ?? new Date().toISOString(),
            }];
          });
        }
      } catch {
        // Ignore parse errors
      }
    };

    eventSource.onerror = () => {
      setConnected(false);
    };

    return () => {
      eventSource.close();
    };
  }, []);

  const resolve = useCallback(async (id: string, approved: boolean) => {
    setResolving((prev) => new Set(prev).add(id));
    try {
      await fetch(`/api/approvals/${id}/resolve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ approved }),
      });
      setApprovals((prev) => prev.filter((a) => a.id !== id));
    } catch {
      // Keep it in the list if resolve fails
    } finally {
      setResolving((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  }, []);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold">Pending Approvals</h2>
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${connected ? 'bg-green-500' : 'bg-red-500'}`} />
          <span className="text-xs text-zinc-500">
            {connected ? 'Connected' : 'Disconnected'}
          </span>
        </div>
      </div>

      {approvals.length === 0 ? (
        <div className="bg-zinc-900 rounded-xl border border-zinc-800 p-8 text-center">
          <p className="text-zinc-500 text-sm">No pending approvals.</p>
          <p className="text-zinc-600 text-xs mt-1">
            Approvals will appear here in real-time when the agent needs permission to execute an action.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {approvals.map((approval) => {
            const isResolving = resolving.has(approval.id);
            return (
              <div
                key={approval.id}
                className="bg-zinc-900 rounded-xl border border-yellow-800/50 p-6"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="inline-block w-2 h-2 rounded-full bg-yellow-500 animate-pulse" />
                      <h3 className="text-sm font-semibold text-yellow-200 font-mono">
                        {approval.action}
                      </h3>
                    </div>
                    {Object.keys(approval.parameters).length > 0 && (
                      <pre className="text-xs text-zinc-400 bg-zinc-950 rounded-lg p-3 mt-2 overflow-x-auto max-h-48">
                        {JSON.stringify(approval.parameters, null, 2)}
                      </pre>
                    )}
                    <p className="text-xs text-zinc-600 mt-2">
                      Requested {new Date(approval.requestedAt).toLocaleTimeString()}
                    </p>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <button
                      onClick={() => resolve(approval.id, true)}
                      disabled={isResolving}
                      className="bg-green-700 hover:bg-green-600 disabled:opacity-50 px-4 py-2 rounded-lg text-sm font-medium transition-colors"
                    >
                      {isResolving ? '...' : 'Approve'}
                    </button>
                    <button
                      onClick={() => resolve(approval.id, false)}
                      disabled={isResolving}
                      className="bg-red-800 hover:bg-red-700 disabled:opacity-50 px-4 py-2 rounded-lg text-sm font-medium transition-colors"
                    >
                      {isResolving ? '...' : 'Deny'}
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
