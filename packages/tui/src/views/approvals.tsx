import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import { Panel } from '../components/panel.js';
import { Countdown } from '../components/countdown.js';
import { useApprovals } from '../hooks/use-approvals.js';

export function ApprovalView() {
  const { approvals, loading, resolve } = useApprovals();
  const [selectedIndex, setSelectedIndex] = useState(0);

  useInput((input, key) => {
    if (approvals.length === 0) return;

    if (key.upArrow) {
      setSelectedIndex((prev) => Math.max(0, prev - 1));
    }
    if (key.downArrow) {
      setSelectedIndex((prev) => Math.min(approvals.length - 1, prev + 1));
    }
    if (input === 'a') {
      const approval = approvals[selectedIndex];
      if (approval) resolve(approval.id, true);
    }
    if (input === 'd') {
      const approval = approvals[selectedIndex];
      if (approval) resolve(approval.id, false);
    }
  });

  return (
    <Box flexDirection="column" gap={1}>
      <Panel title="Pending Approvals" borderColor="yellow">
        <Text dimColor>  a = approve | d = deny | Up/Down = select</Text>
        <Text> </Text>

        {loading ? (
          <Text dimColor>Loading...</Text>
        ) : approvals.length === 0 ? (
          <Text dimColor>No pending approvals.</Text>
        ) : (
          approvals.map((approval, i) => {
            const isSelected = i === selectedIndex;
            const timeout = new Date(new Date(approval.requestedAt).getTime() + 5 * 60 * 1000);

            return (
              <Box key={approval.id} flexDirection="column" marginBottom={1}>
                <Box>
                  <Text color={isSelected ? 'cyan' : 'white'} bold={isSelected}>
                    {isSelected ? '> ' : '  '}
                    {approval.action}
                  </Text>
                  <Text> </Text>
                  <Countdown targetDate={timeout} label="expires:" />
                </Box>
                <Box paddingLeft={4}>
                  <Text dimColor>{JSON.stringify(approval.parameters, null, 0)}</Text>
                </Box>
              </Box>
            );
          })
        )}
      </Panel>
    </Box>
  );
}
