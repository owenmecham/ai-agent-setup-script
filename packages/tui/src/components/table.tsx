import React from 'react';
import { Box, Text } from 'ink';

interface Column {
  key: string;
  label: string;
  width?: number;
  color?: string;
}

interface TableProps {
  columns: Column[];
  rows: Record<string, string>[];
  maxRows?: number;
}

export function Table({ columns, rows, maxRows }: TableProps) {
  const displayRows = maxRows ? rows.slice(0, maxRows) : rows;

  return (
    <Box flexDirection="column">
      {/* Header */}
      <Box>
        {columns.map((col) => (
          <Box key={col.key} width={col.width ?? 20}>
            <Text bold color="cyan">{col.label}</Text>
          </Box>
        ))}
      </Box>

      <Box>
        {columns.map((col) => (
          <Box key={col.key} width={col.width ?? 20}>
            <Text dimColor>{'─'.repeat(Math.min(col.width ?? 20, 30))}</Text>
          </Box>
        ))}
      </Box>

      {/* Rows */}
      {displayRows.length === 0 ? (
        <Text dimColor>  No data.</Text>
      ) : (
        displayRows.map((row, i) => (
          <Box key={i}>
            {columns.map((col) => (
              <Box key={col.key} width={col.width ?? 20}>
                <Text color={col.color}>{(row[col.key] ?? '').slice(0, (col.width ?? 20) - 2)}</Text>
              </Box>
            ))}
          </Box>
        ))
      )}
    </Box>
  );
}
