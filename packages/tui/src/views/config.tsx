import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import { Panel } from '../components/panel.js';
import { InputField } from '../components/input-field.js';
import { useConfig } from '../hooks/use-config.js';

type Section = 'agent' | 'security' | 'memory' | 'logging';

const SECTIONS: { key: Section; label: string }[] = [
  { key: 'agent', label: 'Agent' },
  { key: 'security', label: 'Approval Defaults' },
  { key: 'memory', label: 'Memory' },
  { key: 'logging', label: 'Logging' },
];

interface EditState {
  path: string;
  label: string;
  currentValue: string;
}

export function ConfigView() {
  const { config, loading, error, updateConfig } = useConfig();
  const [activeSection, setActiveSection] = useState(0);
  const [selectedRow, setSelectedRow] = useState(0);
  const [editing, setEditing] = useState<EditState | null>(null);
  const [editValue, setEditValue] = useState('');
  const [message, setMessage] = useState('');

  useInput((_input, key) => {
    if (editing) return;

    if (key.leftArrow) {
      setActiveSection((prev) => Math.max(0, prev - 1));
      setSelectedRow(0);
    }
    if (key.rightArrow) {
      setActiveSection((prev) => Math.min(SECTIONS.length - 1, prev + 1));
      setSelectedRow(0);
    }
    if (key.upArrow) {
      setSelectedRow((prev) => Math.max(0, prev - 1));
    }
    if (key.downArrow) {
      setSelectedRow((prev) => prev + 1);
    }
    if (_input === 'e' || key.return) {
      startEditing();
    }
  });

  const startEditing = () => {
    if (!config) return;
    const section = SECTIONS[activeSection];
    const rows = getRows(section.key);
    if (selectedRow >= rows.length) return;
    const row = rows[selectedRow];
    setEditing({ path: row.path, label: row.label, currentValue: row.value });
    setEditValue(row.value);
  };

  const getRows = (sectionKey: Section): { label: string; value: string; path: string }[] => {
    if (!config) return [];
    switch (sectionKey) {
      case 'agent':
        return [
          { label: 'Name', value: config.agent.name, path: 'agent.name' },
          { label: 'Model', value: config.agent.model, path: 'agent.model' },
          { label: 'Max Budget', value: String(config.agent.max_budget_per_message_usd), path: 'agent.max_budget_per_message_usd' },
          { label: 'Timezone', value: config.agent.timezone, path: 'agent.timezone' },
        ];
      case 'security':
        return Object.entries(config.security.approval_defaults).map(([action, level]) => ({
          label: action,
          value: level,
          path: `security.approval_defaults.${action}`,
        }));
      case 'memory':
        return [
          { label: 'Buffer Size', value: String(config.memory.short_term_buffer_size), path: 'memory.short_term_buffer_size' },
          { label: 'Flush Interval', value: String(config.memory.flush_interval_seconds), path: 'memory.flush_interval_seconds' },
          { label: 'Semantic Limit', value: String(config.memory.semantic_search_limit), path: 'memory.semantic_search_limit' },
          { label: 'Knowledge Limit', value: String(config.memory.knowledge_search_limit), path: 'memory.knowledge_search_limit' },
          { label: 'Max Context Tokens', value: String(config.memory.max_context_tokens), path: 'memory.max_context_tokens' },
        ];
      case 'logging':
        return [
          { label: 'Level', value: config.logging.level, path: 'logging.level' },
          { label: 'File', value: config.logging.file, path: 'logging.file' },
        ];
    }
  };

  const handleSave = async () => {
    if (!editing) return;
    const { path } = editing;

    // Convert value types for number fields
    let value: unknown = editValue;
    if (path.includes('max_budget')) value = parseFloat(editValue);
    else if (['buffer_size', 'flush_interval', 'semantic_search_limit', 'knowledge_search_limit', 'max_context_tokens'].some(k => path.includes(k))) {
      value = parseInt(editValue);
    }

    // Build nested update object from dotpath
    const parts = path.split('.');
    let update: Record<string, unknown> = {};
    let current = update;
    for (let i = 0; i < parts.length - 1; i++) {
      current[parts[i]] = {};
      current = current[parts[i]] as Record<string, unknown>;
    }
    current[parts[parts.length - 1]] = value;

    const success = await updateConfig(update);
    if (success) {
      setMessage(`Updated ${editing.label}`);
      setTimeout(() => setMessage(''), 3000);
    }
    setEditing(null);
  };

  if (loading || !config) {
    return <Text dimColor>Loading configuration...</Text>;
  }

  if (error) {
    return <Text color="red">Error: {error}</Text>;
  }

  if (editing) {
    return (
      <Panel title={`Edit: ${editing.label}`} borderColor="yellow">
        <Text dimColor>Current: {editing.currentValue}</Text>
        <InputField
          label="New Value"
          value={editValue}
          onChange={setEditValue}
          onSubmit={handleSave}
          placeholder="Enter new value"
        />
        <Text dimColor>Enter = save | Esc = cancel</Text>
      </Panel>
    );
  }

  const section = SECTIONS[activeSection];
  const rows = getRows(section.key);

  return (
    <Box flexDirection="column" gap={1}>
      <Box gap={1}>
        {SECTIONS.map((s, i) => (
          <Text
            key={s.key}
            bold={i === activeSection}
            color={i === activeSection ? 'cyan' : 'gray'}
            inverse={i === activeSection}
          >
            {` ${s.label} `}
          </Text>
        ))}
      </Box>

      <Panel title={section.label} borderColor="cyan">
        <Text dimColor>  e/Enter = edit | Left/Right = section | Up/Down = select</Text>
        <Text> </Text>
        {rows.map((row, i) => {
          const isSelected = i === selectedRow;
          const levelColor = row.value === 'require' ? 'red' : row.value === 'notify' ? 'yellow' : row.value === 'auto' ? 'green' : undefined;
          return (
            <Box key={row.path} gap={2}>
              <Text color={isSelected ? 'cyan' : 'white'} bold={isSelected}>
                {isSelected ? '>' : ' '}
              </Text>
              <Box width={25}>
                <Text bold={isSelected}>{row.label}</Text>
              </Box>
              <Text color={levelColor}>{row.value}</Text>
            </Box>
          );
        })}
      </Panel>

      {message && <Text color="green">{message}</Text>}
    </Box>
  );
}
