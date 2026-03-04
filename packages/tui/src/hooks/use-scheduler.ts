import { useState, useEffect, useCallback } from 'react';
import { getIPCClient } from './use-agent.js';

export interface ScheduledTask {
  id: string;
  name: string;
  cronExpression: string;
  action: string;
  parameters: Record<string, unknown>;
  enabled: boolean;
  lastRunAt?: string;
}

export function useScheduler() {
  const [tasks, setTasks] = useState<ScheduledTask[]>([]);
  const [loading, setLoading] = useState(true);
  const client = getIPCClient();

  const refresh = useCallback(async () => {
    if (!client.connected) return;
    try {
      setLoading(true);
      const data = await client.call('scheduler.list');
      setTasks(data as ScheduledTask[]);
    } catch {
      // Ignore errors
    } finally {
      setLoading(false);
    }
  }, []);

  const createTask = useCallback(async (task: Omit<ScheduledTask, 'id' | 'lastRunAt'>) => {
    try {
      await client.call('scheduler.create', task as unknown as Record<string, unknown>);
      await refresh();
      return true;
    } catch {
      return false;
    }
  }, [refresh]);

  const deleteTask = useCallback(async (id: string) => {
    try {
      await client.call('scheduler.delete', { id });
      setTasks((prev) => prev.filter((t) => t.id !== id));
      return true;
    } catch {
      return false;
    }
  }, []);

  const toggleTask = useCallback(async (id: string, enabled: boolean) => {
    try {
      await client.call('scheduler.update', { id, enabled });
      setTasks((prev) => prev.map((t) => t.id === id ? { ...t, enabled } : t));
      return true;
    } catch {
      return false;
    }
  }, []);

  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, 10000);
    return () => clearInterval(interval);
  }, [refresh]);

  return { tasks, loading, refresh, createTask, deleteTask, toggleTask };
}
