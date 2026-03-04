import React from 'react';
import { Box, Text } from 'ink';
import TextInput from 'ink-text-input';

interface InputFieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  onSubmit?: (value: string) => void;
  placeholder?: string;
  mask?: string;
}

export function InputField({ label, value, onChange, onSubmit, placeholder, mask }: InputFieldProps) {
  return (
    <Box>
      <Text bold>{label}: </Text>
      <TextInput
        value={value}
        onChange={onChange}
        onSubmit={onSubmit}
        placeholder={placeholder}
        mask={mask}
      />
    </Box>
  );
}
