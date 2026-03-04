import React from 'react';
import { Box, Text } from 'ink';

interface Tab {
  key: string;
  label: string;
}

interface TabBarProps {
  tabs: Tab[];
  activeIndex: number;
  onSelect: (index: number) => void;
}

export function TabBar({ tabs, activeIndex }: TabBarProps) {
  return (
    <Box paddingX={1} gap={1}>
      {tabs.map((tab, i) => (
        <Box key={tab.key}>
          <Text
            bold={i === activeIndex}
            color={i === activeIndex ? 'cyan' : 'gray'}
            inverse={i === activeIndex}
          >
            {` ${tab.key}:${tab.label} `}
          </Text>
        </Box>
      ))}
    </Box>
  );
}
