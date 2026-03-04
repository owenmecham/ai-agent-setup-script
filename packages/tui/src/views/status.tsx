import React, { useState, useEffect } from 'react';
import { Box, Text } from 'ink';
import { Panel } from '../components/panel.js';
import { StatusBadge } from '../components/status-badge.js';
import { getIPCClient } from '../hooks/use-agent.js';

function formatUptime(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days}d ${hours % 24}h ${minutes % 60}m`;
  if (hours > 0) return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
  if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
  return `${seconds}s`;
}

export function StatusView() {
  const [status, setStatus] = useState<{ name: string; uptime: number; channels: string[] } | null>(null);
  const client = getIPCClient();

  useEffect(() => {
    const refresh = async () => {
      if (!client.connected) return;
      try {
        const data = await client.getStatus();
        setStatus(data);
      } catch {
        // Ignore
      }
    };

    refresh();
    const interval = setInterval(refresh, 3000);
    return () => clearInterval(interval);
  }, []);

  if (!status) {
    return <Text dimColor>Loading status...</Text>;
  }

  return (
    <Box flexDirection="column" gap={1}>
      <Panel title="Agent Status" borderColor="cyan">
        <Box gap={2}>
          <Text bold>Name:</Text>
          <Text>{status.name}</Text>
        </Box>
        <Box gap={2}>
          <Text bold>Status:</Text>
          <StatusBadge status="running" />
        </Box>
        <Box gap={2}>
          <Text bold>Uptime:</Text>
          <Text>{formatUptime(status.uptime)}</Text>
        </Box>
      </Panel>

      <Panel title="Channels" borderColor="blue">
        {status.channels.length === 0 ? (
          <Text dimColor>No channels active</Text>
        ) : (
          status.channels.map((ch) => (
            <Box key={ch} gap={2}>
              <Text bold>{ch}:</Text>
              <StatusBadge status="connected" />
            </Box>
          ))
        )}
      </Panel>
    </Box>
  );
}
