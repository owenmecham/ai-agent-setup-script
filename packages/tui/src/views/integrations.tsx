import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import { Panel } from '../components/panel.js';
import { StatusBadge } from '../components/status-badge.js';
import { useConfig } from '../hooks/use-config.js';

interface IntegrationItem {
  name: string;
  enabled: boolean;
  type: 'channel' | 'integration';
}

export function IntegrationsView() {
  const { config, loading, error, updateConfig } = useConfig();
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [message, setMessage] = useState('');

  const items: IntegrationItem[] = [];
  if (config) {
    // Channels
    items.push({ name: 'telegram', enabled: config.channels.telegram.enabled, type: 'channel' });
    items.push({ name: 'imessage', enabled: config.channels.imessage.enabled, type: 'channel' });

    // Integrations
    for (const [name, settings] of Object.entries(config.integrations)) {
      items.push({ name, enabled: settings.enabled, type: 'integration' });
    }

    // Scheduler & Creator
    items.push({ name: 'scheduler', enabled: config.scheduler.enabled, type: 'integration' });
    items.push({ name: 'creator', enabled: config.creator.enabled, type: 'integration' });
  }

  useInput(async (input, key) => {
    if (key.upArrow) {
      setSelectedIndex((prev) => Math.max(0, prev - 1));
    }
    if (key.downArrow) {
      setSelectedIndex((prev) => Math.min(items.length - 1, prev + 1));
    }
    if (key.return || input === 't') {
      await toggleSelected();
    }
  });

  const toggleSelected = async () => {
    if (!config || selectedIndex >= items.length) return;
    const item = items[selectedIndex];
    const newEnabled = !item.enabled;

    let updates: Record<string, unknown>;
    if (item.type === 'channel') {
      updates = { channels: { [item.name]: { enabled: newEnabled } } };
    } else if (item.name === 'scheduler') {
      updates = { scheduler: { enabled: newEnabled } };
    } else if (item.name === 'creator') {
      updates = { creator: { enabled: newEnabled } };
    } else {
      updates = { integrations: { [item.name]: { enabled: newEnabled } } };
    }

    const success = await updateConfig(updates);
    if (success) {
      setMessage(`${item.name} ${newEnabled ? 'enabled' : 'disabled'}`);
      setTimeout(() => setMessage(''), 3000);
    }
  };

  if (loading || !config) {
    return <Text dimColor>Loading integrations...</Text>;
  }

  if (error) {
    return <Text color="red">Error: {error}</Text>;
  }

  return (
    <Box flexDirection="column" gap={1}>
      <Panel title="Integrations & Channels" borderColor="magenta">
        <Text dimColor>  Enter/t = toggle | Up/Down = select</Text>
        <Text> </Text>
        {items.map((item, i) => {
          const isSelected = i === selectedIndex;
          return (
            <Box key={item.name} gap={2}>
              <Text color={isSelected ? 'cyan' : 'white'} bold={isSelected}>
                {isSelected ? '>' : ' '}
              </Text>
              <Box width={20}>
                <Text bold={isSelected}>{item.name}</Text>
              </Box>
              <Box width={8}>
                <Text dimColor>[{item.type === 'channel' ? 'ch' : 'int'}]</Text>
              </Box>
              <StatusBadge status={item.enabled ? 'enabled' : 'disabled'} />
            </Box>
          );
        })}
      </Panel>

      {message && <Text color="green">{message}</Text>}
    </Box>
  );
}
