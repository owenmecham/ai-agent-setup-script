import { useState, useEffect, useCallback } from 'react';
import { getIPCClient } from './use-agent.js';

export interface AuditEntry {
  id: string;
  timestamp: string;
  action: string;
  status: string;
  channel: string;
  conversationId: string;
  userId: string;
  parameters?: Record<string, unknown>;
  result?: unknown;
  error?: string;
}

export function useAudit(filters?: { action?: string; status?: string; channel?: string }) {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const client = getIPCClient();

  const refresh = useCallback(async () => {
    if (!client.connected) return;
    try {
      setLoading(true);
      const data = await client.queryAudit({
        limit: 50,
        ...filters,
      });
      setEntries(data as AuditEntry[]);
    } catch {
      // Ignore errors during refresh
    } finally {
      setLoading(false);
    }
  }, [filters?.action, filters?.status, filters?.channel]);

  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, 5000);
    return () => clearInterval(interval);
  }, [refresh]);

  return { entries, loading, refresh };
}
