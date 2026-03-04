import React from 'react';
import { Text } from 'ink';

const STATUS_COLORS: Record<string, string> = {
  completed: 'green',
  started: 'blue',
  approved: 'green',
  denied: 'red',
  failed: 'red',
  running: 'green',
  connected: 'green',
  disconnected: 'red',
  disabled: 'gray',
  enabled: 'green',
  active: 'green',
  unknown: 'yellow',
};

interface StatusBadgeProps {
  status: string;
}

export function StatusBadge({ status }: StatusBadgeProps) {
  const color = STATUS_COLORS[status] ?? 'gray';
  return <Text color={color}>[{status}]</Text>;
}
