import React, { useState, useEffect, useRef } from 'react';
import { Box, Text, useInput } from 'ink';
import TextInput from 'ink-text-input';
import { Panel } from '../components/panel.js';
import { getIPCClient } from '../hooks/use-agent.js';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

export function ChatView() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [conversationId] = useState(() => crypto.randomUUID());
  const client = getIPCClient();

  const sendMessage = async () => {
    if (!input.trim() || sending) return;

    const userMessage: ChatMessage = {
      role: 'user',
      content: input,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    const messageText = input;
    setInput('');
    setSending(true);

    try {
      const result = await client.sendChat(messageText, conversationId);
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: result.response,
          timestamp: new Date(),
        },
      ]);
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: `Error: ${err instanceof Error ? err.message : 'Failed to get response'}`,
          timestamp: new Date(),
        },
      ]);
    } finally {
      setSending(false);
    }
  };

  // Show last N messages
  const visibleMessages = messages.slice(-15);

  return (
    <Box flexDirection="column" gap={1}>
      <Panel title="Chat with Murph" borderColor="cyan">
        {visibleMessages.length === 0 ? (
          <Text dimColor>Type a message to start chatting.</Text>
        ) : (
          visibleMessages.map((msg, i) => (
            <Box key={i} marginBottom={1}>
              <Text bold color={msg.role === 'user' ? 'blue' : 'green'}>
                {msg.role === 'user' ? 'You' : 'Murph'}:{' '}
              </Text>
              <Text wrap="wrap">{msg.content}</Text>
            </Box>
          ))
        )}
        {sending && <Text color="yellow">Thinking...</Text>}
      </Panel>

      <Box>
        <Text bold color="cyan">&gt; </Text>
        <TextInput
          value={input}
          onChange={setInput}
          onSubmit={sendMessage}
          placeholder={sending ? 'Waiting for response...' : 'Type a message...'}
        />
      </Box>
    </Box>
  );
}
