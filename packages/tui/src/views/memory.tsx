import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import { Panel } from '../components/panel.js';
import { Table } from '../components/table.js';
import { useMemory } from '../hooks/use-memory.js';

const SUB_PANELS = ['Conversations', 'Entities', 'Semantic'] as const;

export function MemoryView() {
  const [activePanel, setActivePanel] = useState(0);
  const { conversations, entities, semanticMemories, loading, refresh } = useMemory();

  useInput((input) => {
    if (input === '!' || input === '@' || input === '#') {
      // Shift+1, Shift+2, Shift+3 — not reliable; use plain keys instead
    }
    if (input === 'c') setActivePanel(0);
    if (input === 'e') setActivePanel(1);
    if (input === 's') setActivePanel(2);
    if (input === 'r') refresh();
  });

  return (
    <Box flexDirection="column" gap={1}>
      <Box gap={2}>
        {SUB_PANELS.map((label, i) => (
          <Text
            key={label}
            bold={i === activePanel}
            color={i === activePanel ? 'cyan' : 'gray'}
            inverse={i === activePanel}
          >
            {` ${label[0]}:${label} `}
          </Text>
        ))}
        <Text dimColor> r = refresh</Text>
      </Box>

      {loading ? (
        <Text dimColor>Loading memory data...</Text>
      ) : activePanel === 0 ? (
        <Panel title="Conversations" borderColor="blue">
          {conversations.length === 0 ? (
            <Text dimColor>No conversations recorded.</Text>
          ) : (
            <Table
              columns={[
                { key: 'channel', label: 'Channel', width: 12 },
                { key: 'messages', label: 'Messages', width: 10 },
                { key: 'updated', label: 'Updated', width: 20 },
              ]}
              rows={conversations.map((c) => ({
                channel: c.channel,
                messages: String(c.messageCount),
                updated: new Date(c.updatedAt).toLocaleString(),
              }))}
              maxRows={20}
            />
          )}
        </Panel>
      ) : activePanel === 1 ? (
        <Panel title="Entities" borderColor="green">
          {entities.length === 0 ? (
            <Text dimColor>No entities stored.</Text>
          ) : (
            <Table
              columns={[
                { key: 'name', label: 'Name', width: 20 },
                { key: 'type', label: 'Type', width: 12 },
                { key: 'lastSeen', label: 'Last Seen', width: 20 },
              ]}
              rows={entities.map((e) => ({
                name: e.name,
                type: e.type,
                lastSeen: new Date(e.lastSeen).toLocaleString(),
              }))}
              maxRows={20}
            />
          )}
        </Panel>
      ) : (
        <Panel title="Semantic Memories" borderColor="magenta">
          {semanticMemories.length === 0 ? (
            <Text dimColor>No semantic memories stored.</Text>
          ) : (
            semanticMemories.map((m) => (
              <Box key={m.id} flexDirection="column" marginBottom={1}>
                <Box gap={2}>
                  <Text color="yellow">importance: {m.importance}</Text>
                  <Text dimColor>{new Date(m.createdAt).toLocaleString()}</Text>
                </Box>
                <Text>{m.summary}</Text>
              </Box>
            ))
          )}
        </Panel>
      )}
    </Box>
  );
}
