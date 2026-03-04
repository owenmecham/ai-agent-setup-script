import { useState, useEffect, useCallback } from 'react';
import { getIPCClient } from './use-agent.js';
import type { MurphConfig } from '@murph/core';

export function useConfig() {
  const [config, setConfig] = useState<MurphConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const client = getIPCClient();

  const refresh = useCallback(async () => {
    if (!client.connected) return;
    try {
      setLoading(true);
      const data = await client.getConfig();
      setConfig(data as MurphConfig);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load config');
    } finally {
      setLoading(false);
    }
  }, []);

  const updateConfig = useCallback(async (updates: Record<string, unknown>) => {
    try {
      const data = await client.updateConfig(updates);
      setConfig(data as MurphConfig);
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update config');
      return false;
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { config, loading, error, refresh, updateConfig };
}
