import React, { useState, useEffect } from 'react';
import { Box, Text, useInput } from 'ink';
import { Panel } from '../components/panel.js';
import { InputField } from '../components/input-field.js';
import { Confirm } from '../components/confirm.js';
import { getIPCClient } from '../hooks/use-agent.js';

type Mode = 'list' | 'add-name' | 'add-value' | 'confirm-delete';

export function SecretsView() {
  const [secrets, setSecrets] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [mode, setMode] = useState<Mode>('list');
  const [newName, setNewName] = useState('');
  const [newValue, setNewValue] = useState('');
  const client = getIPCClient();

  const refresh = async () => {
    if (!client.connected) return;
    try {
      setLoading(true);
      const data = await client.call('secrets.list');
      setSecrets(data as string[]);
    } catch {
      // Ignore
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
  }, []);

  useInput((input, key) => {
    if (mode !== 'list') return;

    if (key.upArrow && secrets.length > 0) {
      setSelectedIndex((prev) => Math.max(0, prev - 1));
    }
    if (key.downArrow && secrets.length > 0) {
      setSelectedIndex((prev) => Math.min(secrets.length - 1, prev + 1));
    }
    if (input === 'a') {
      setMode('add-name');
      setNewName('');
      setNewValue('');
    }
    if (input === 'x' && secrets.length > 0) {
      setMode('confirm-delete');
    }
  });

  if (mode === 'add-name') {
    return (
      <Panel title="Add Secret" borderColor="yellow">
        <InputField
          label="Secret Name"
          value={newName}
          onChange={setNewName}
          onSubmit={() => {
            if (newName.trim()) setMode('add-value');
          }}
          placeholder="e.g. TELEGRAM_BOT_TOKEN"
        />
      </Panel>
    );
  }

  if (mode === 'add-value') {
    return (
      <Panel title={`Add Secret: ${newName}`} borderColor="yellow">
        <InputField
          label="Value"
          value={newValue}
          onChange={setNewValue}
          onSubmit={async () => {
            if (newValue.trim()) {
              await client.call('secrets.set', { name: newName, value: newValue });
              setNewName('');
              setNewValue('');
              setMode('list');
              refresh();
            }
          }}
          mask="*"
          placeholder="Enter secret value"
        />
      </Panel>
    );
  }

  if (mode === 'confirm-delete') {
    const name = secrets[selectedIndex];
    return (
      <Confirm
        message={`Delete secret "${name}"?`}
        onConfirm={async () => {
          await client.call('secrets.delete', { name });
          setMode('list');
          refresh();
        }}
        onCancel={() => setMode('list')}
      />
    );
  }

  return (
    <Box flexDirection="column" gap={1}>
      <Panel title="Secrets" borderColor="red">
        <Text dimColor>  a = add | x = delete | Up/Down = select</Text>
        <Text> </Text>

        {loading ? (
          <Text dimColor>Loading secrets...</Text>
        ) : secrets.length === 0 ? (
          <Text dimColor>No secrets stored.</Text>
        ) : (
          secrets.map((name, i) => {
            const isSelected = i === selectedIndex;
            return (
              <Box key={name}>
                <Text color={isSelected ? 'cyan' : 'white'} bold={isSelected}>
                  {isSelected ? '> ' : '  '}{name}
                </Text>
              </Box>
            );
          })
        )}
      </Panel>
    </Box>
  );
}
