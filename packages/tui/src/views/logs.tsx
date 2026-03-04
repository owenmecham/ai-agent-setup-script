import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import { Table } from '../components/table.js';
import { Panel } from '../components/panel.js';
import { useAudit, type AuditEntry } from '../hooks/use-audit.js';

const STATUS_COLORS: Record<string, string> = {
  completed: 'green',
  started: 'blue',
  approved: 'green',
  denied: 'red',
  failed: 'red',
};

function formatTime(ts: string): string {
  const d = new Date(ts);
  return d.toLocaleTimeString();
}

export function LogsView() {
  const [filter, setFilter] = useState<{ action?: string; status?: string; channel?: string }>({});
  const { entries, loading } = useAudit(filter);

  const columns = [
    { key: 'time', label: 'Time', width: 12 },
    { key: 'action', label: 'Action', width: 25 },
    { key: 'status', label: 'Status', width: 12 },
    { key: 'channel', label: 'Channel', width: 12 },
    { key: 'user', label: 'User', width: 15 },
  ];

  const rows = entries.map((e) => ({
    time: formatTime(e.timestamp),
    action: e.action,
    status: e.status,
    channel: e.channel ?? '',
    user: e.userId ?? '',
  }));

  return (
    <Box flexDirection="column" gap={1}>
      <Panel title="Audit Log" borderColor="magenta">
        {loading ? (
          <Text dimColor>Loading audit log...</Text>
        ) : (
          <Table columns={columns} rows={rows} maxRows={30} />
        )}
      </Panel>
    </Box>
  );
}
