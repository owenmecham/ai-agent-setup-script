import { useState, useEffect, useCallback } from 'react';
import { getIPCClient } from './use-agent.js';

export interface PendingApproval {
  id: string;
  action: string;
  parameters: Record<string, unknown>;
  requestedAt: string;
}

export function useApprovals() {
  const [approvals, setApprovals] = useState<PendingApproval[]>([]);
  const [loading, setLoading] = useState(true);
  const client = getIPCClient();

  const refresh = useCallback(async () => {
    if (!client.connected) return;
    try {
      setLoading(true);
      const data = await client.listApprovals();
      setApprovals(data);
    } catch {
      // Ignore errors during refresh
    } finally {
      setLoading(false);
    }
  }, []);

  const resolve = useCallback(async (requestId: string, approved: boolean) => {
    try {
      await client.resolveApproval(requestId, approved, 'tui-user');
      setApprovals((prev) => prev.filter((a) => a.id !== requestId));
    } catch {
      // Will be cleaned up on next refresh
    }
  }, []);

  useEffect(() => {
    refresh();

    const handler = (data: unknown) => {
      const approval = data as PendingApproval;
      setApprovals((prev) => [...prev, approval]);
    };
    client.on('approval-required', handler);

    const interval = setInterval(refresh, 5000);

    return () => {
      client.removeListener('approval-required', handler);
      clearInterval(interval);
    };
  }, [refresh]);

  return { approvals, loading, refresh, resolve };
}
