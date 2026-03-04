import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import { Panel } from '../components/panel.js';
import { Table } from '../components/table.js';
import { StatusBadge } from '../components/status-badge.js';
import { Confirm } from '../components/confirm.js';
import { useScheduler } from '../hooks/use-scheduler.js';

export function SchedulerView() {
  const { tasks, loading, deleteTask, toggleTask } = useScheduler();
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  useInput((input, key) => {
    if (confirmDelete) return;
    if (tasks.length === 0) return;

    if (key.upArrow) {
      setSelectedIndex((prev) => Math.max(0, prev - 1));
    }
    if (key.downArrow) {
      setSelectedIndex((prev) => Math.min(tasks.length - 1, prev + 1));
    }
    if (input === 't') {
      const task = tasks[selectedIndex];
      if (task) toggleTask(task.id, !task.enabled);
    }
    if (input === 'x') {
      const task = tasks[selectedIndex];
      if (task) setConfirmDelete(task.id);
    }
  });

  if (confirmDelete) {
    return (
      <Confirm
        message="Delete this scheduled task?"
        onConfirm={() => {
          deleteTask(confirmDelete);
          setConfirmDelete(null);
        }}
        onCancel={() => setConfirmDelete(null)}
      />
    );
  }

  return (
    <Box flexDirection="column" gap={1}>
      <Panel title="Scheduled Tasks" borderColor="green">
        <Text dimColor>  t = toggle | x = delete | Up/Down = select</Text>
        <Text> </Text>

        {loading ? (
          <Text dimColor>Loading tasks...</Text>
        ) : tasks.length === 0 ? (
          <Text dimColor>No scheduled tasks.</Text>
        ) : (
          tasks.map((task, i) => {
            const isSelected = i === selectedIndex;
            return (
              <Box key={task.id} gap={2}>
                <Text color={isSelected ? 'cyan' : 'white'} bold={isSelected}>
                  {isSelected ? '>' : ' '}
                </Text>
                <StatusBadge status={task.enabled ? 'active' : 'disabled'} />
                <Text bold>{task.name}</Text>
                <Text dimColor>{task.cronExpression}</Text>
                <Text color="gray">{task.action}</Text>
                <Text dimColor>
                  {task.lastRunAt ? `last: ${new Date(task.lastRunAt).toLocaleString()}` : 'never run'}
                </Text>
              </Box>
            );
          })
        )}
      </Panel>
    </Box>
  );
}
