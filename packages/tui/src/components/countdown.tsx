import React, { useState, useEffect } from 'react';
import { Text } from 'ink';

interface CountdownProps {
  targetDate: Date;
  label?: string;
}

export function Countdown({ targetDate, label }: CountdownProps) {
  const [remaining, setRemaining] = useState(() => Math.max(0, targetDate.getTime() - Date.now()));

  useEffect(() => {
    const interval = setInterval(() => {
      const diff = Math.max(0, targetDate.getTime() - Date.now());
      setRemaining(diff);
      if (diff <= 0) clearInterval(interval);
    }, 1000);
    return () => clearInterval(interval);
  }, [targetDate]);

  const minutes = Math.floor(remaining / 60000);
  const seconds = Math.floor((remaining % 60000) / 1000);
  const color = remaining < 60000 ? 'red' : remaining < 120000 ? 'yellow' : 'green';

  return (
    <Text color={color}>
      {label ? `${label} ` : ''}{minutes}:{seconds.toString().padStart(2, '0')}
    </Text>
  );
}
