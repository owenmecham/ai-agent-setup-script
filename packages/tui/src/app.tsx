import React, { useState, useEffect } from 'react';
import { Box, Text, useInput, useApp } from 'ink';
import { TabBar } from './components/tab-bar.js';
import { StatusView } from './views/status.js';
import { ApprovalView } from './views/approvals.js';
import { LogsView } from './views/logs.js';
import { SchedulerView } from './views/scheduler.js';
import { MemoryView } from './views/memory.js';
import { ConfigView } from './views/config.js';
import { IntegrationsView } from './views/integrations.js';
import { SecretsView } from './views/secrets.js';
import { ChatView } from './views/chat.js';
import { useAgent } from './hooks/use-agent.js';

const TABS = [
  { key: '1', label: 'Status' },
  { key: '2', label: 'Approvals' },
  { key: '3', label: 'Logs' },
  { key: '4', label: 'Scheduler' },
  { key: '5', label: 'Memory' },
  { key: '6', label: 'Config' },
  { key: '7', label: 'Integrations' },
  { key: '8', label: 'Secrets' },
  { key: '9', label: 'Chat' },
];

export function App() {
  const [activeTab, setActiveTab] = useState(0);
  const { connected, error, reconnecting } = useAgent();
  const { exit } = useApp();

  useInput((input, key) => {
    if (input === 'q' && key.ctrl) {
      exit();
      return;
    }

    // Tab switching via number keys
    const tabIndex = parseInt(input) - 1;
    if (tabIndex >= 0 && tabIndex < TABS.length) {
      setActiveTab(tabIndex);
      return;
    }
  });

  const renderView = () => {
    switch (activeTab) {
      case 0: return <StatusView />;
      case 1: return <ApprovalView />;
      case 2: return <LogsView />;
      case 3: return <SchedulerView />;
      case 4: return <MemoryView />;
      case 5: return <ConfigView />;
      case 6: return <IntegrationsView />;
      case 7: return <SecretsView />;
      case 8: return <ChatView />;
      default: return <StatusView />;
    }
  };

  return (
    <Box flexDirection="column" width="100%">
      <Box borderStyle="double" borderColor="cyan" paddingX={1}>
        <Text bold color="cyan">Murph TUI</Text>
        <Text> </Text>
        {connected ? (
          <Text color="green">Connected</Text>
        ) : reconnecting ? (
          <Text color="yellow">Reconnecting...</Text>
        ) : (
          <Text color="red">Disconnected{error ? `: ${error}` : ''}</Text>
        )}
        <Text> | </Text>
        <Text dimColor>Ctrl+Q to quit</Text>
      </Box>

      <TabBar tabs={TABS} activeIndex={activeTab} onSelect={setActiveTab} />

      <Box flexDirection="column" minHeight={20} paddingX={1}>
        {renderView()}
      </Box>
    </Box>
  );
}
