'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { MurphAvatar, UserAvatar } from '../../components/chat-avatars';
import { MarkdownMessage } from '../../components/markdown-message';
import { ConversationList } from '../../components/conversation-list';

interface ChatConfig {
  agent: {
    name: string;
    welcome_quotes: string[];
  };
}

interface AgentStepData {
  action: string;
  parameters: Record<string, unknown>;
  success: boolean;
  data?: unknown;
  error?: string;
}

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  steps?: AgentStepData[];
}

function ActionSteps({ steps }: { steps: AgentStepData[] }) {
  const [expanded, setExpanded] = useState<Record<number, boolean>>({});

  if (!steps || steps.length === 0) return null;

  return (
    <div className="mt-2 space-y-1">
      {steps.map((step, i) => (
        <div key={i} className="border border-zinc-700 rounded-lg overflow-hidden">
          <button
            onClick={() => setExpanded((prev) => ({ ...prev, [i]: !prev[i] }))}
            className="w-full flex items-center gap-2 px-3 py-2 text-left text-xs hover:bg-zinc-800/50 transition-colors"
          >
            <span className={`w-2 h-2 rounded-full flex-shrink-0 ${step.success ? 'bg-green-500' : 'bg-red-500'}`} />
            <span className="font-mono text-zinc-300 flex-1 truncate">{step.action}</span>
            <span className="text-zinc-500">{expanded[i] ? '\u25B2' : '\u25BC'}</span>
          </button>
          {expanded[i] && (
            <div className="px-3 py-2 border-t border-zinc-700 text-xs bg-zinc-900/50">
              {step.error && (
                <p className="text-red-400 mb-1">Error: {step.error}</p>
              )}
              {step.data !== undefined && (() => {
                // Render base64 images inline (e.g. Playwright screenshots)
                const dataStr = typeof step.data === 'string' ? step.data : JSON.stringify(step.data, null, 2);
                const base64Match = typeof step.data === 'string' && step.data.match(/^data:image\/(png|jpeg|gif|webp);base64,/);
                if (base64Match) {
                  return <img src={step.data as string} alt="Screenshot" className="max-w-full rounded mt-1" />;
                }
                // Check for nested base64 in objects
                if (typeof step.data === 'object' && step.data !== null) {
                  const obj = step.data as Record<string, unknown>;
                  if (typeof obj.base64 === 'string' || typeof obj.screenshot === 'string') {
                    const b64 = (obj.base64 ?? obj.screenshot) as string;
                    const src = b64.startsWith('data:') ? b64 : `data:image/png;base64,${b64}`;
                    return (
                      <div>
                        <img src={src} alt="Screenshot" className="max-w-full rounded mt-1" />
                        <pre className="text-zinc-400 whitespace-pre-wrap break-words mt-1 max-h-40 overflow-y-auto">{JSON.stringify({ ...obj, base64: '(shown above)', screenshot: '(shown above)' }, null, 2)}</pre>
                      </div>
                    );
                  }
                }
                return <pre className="text-zinc-400 whitespace-pre-wrap break-words max-h-60 overflow-y-auto">{dataStr}</pre>;
              })()}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

export default function ChatPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [model, setModel] = useState('sonnet');
  const [quote, setQuote] = useState('');
  const [onboarding, setOnboarding] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const onboardingTriggered = useRef(false);

  const { data: chatConfig } = useQuery({
    queryKey: ['config'],
    queryFn: async () => {
      const res = await fetch('/api/config');
      return res.json() as Promise<ChatConfig>;
    },
  });

  const agentName = chatConfig?.agent?.name ?? 'Murph';
  const welcomeQuotes = chatConfig?.agent?.welcome_quotes ?? [];

  // Pick a random quote when config loads
  useEffect(() => {
    if (welcomeQuotes.length > 0) {
      setQuote(welcomeQuotes[Math.floor(Math.random() * welcomeQuotes.length)]);
    }
  }, [welcomeQuotes]);

  // Check for onboarding on mount (gated on config being loaded)
  useEffect(() => {
    if (onboardingTriggered.current || !chatConfig) return;
    onboardingTriggered.current = true;

    fetch('/api/profile')
      .then((res) => res.json())
      .then((data) => {
        // Profile is empty if null or has no name set
        if (!data || !data.name) {
          setOnboarding(true);
          triggerOnboarding();
        }
      })
      .catch(() => {
        // Can't check profile, skip onboarding
      });
  }, [chatConfig]); // eslint-disable-line react-hooks/exhaustive-deps

  const triggerOnboarding = async () => {
    const name = chatConfig?.agent?.name ?? 'Murph';
    const onboardingPrompt = `The user just arrived for the first time and has no profile set up yet. Please introduce yourself as ${name} — a personal AI assistant. Be warm and conversational. Ask them about themselves: their name, where they live, what they do for work, their hobbies, and any social media handles they'd like to share. When they provide information, use the "profile.update" action to save it. You can update incrementally as they share details — you don't need to wait for everything at once.`;

    const onboardingConvId = crypto.randomUUID();
    setConversationId(onboardingConvId);
    setLoading(true);

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: onboardingPrompt,
          conversationId: onboardingConvId,
          model,
        }),
      });

      const data = await response.json();
      const assistantMessage: Message = {
        id: Date.now().toString(),
        role: 'assistant',
        content: data.response ?? `Hi there! I'm ${name}, your personal AI assistant. What's your name?`,
        timestamp: new Date(),
      };

      setMessages([assistantMessage]);
    } catch {
      const name = chatConfig?.agent?.name ?? 'Murph';
      setMessages([{
        id: Date.now().toString(),
        role: 'assistant',
        content: `Hi there! I'm ${name}, your personal AI assistant. I'd love to get to know you. What's your name?`,
        timestamp: new Date(),
      }]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Auto-resize textarea
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 200) + 'px';
  }, [input]);

  const loadConversation = useCallback(async (id: string) => {
    try {
      const res = await fetch(`/api/chat/conversations/${id}/messages`);
      if (!res.ok) return;
      const data = await res.json();
      setMessages(
        data.map((m: { id: string; role: string; content: string; timestamp: string }) => ({
          ...m,
          timestamp: new Date(m.timestamp),
        })),
      );
      setConversationId(id);
    } catch {
      // keep current state
    }
  }, []);

  const startNewChat = useCallback(() => {
    setMessages([]);
    setConversationId(null);
  }, []);

  const sendMessage = async () => {
    if (!input.trim() || loading) return;

    const activeConversationId = conversationId ?? crypto.randomUUID();
    if (!conversationId) {
      setConversationId(activeConversationId);
    }

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: input,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setLoading(true);

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: input, conversationId: activeConversationId, model }),
      });

      const data = await response.json();
      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: data.response ?? 'No response',
        timestamp: new Date(),
        steps: data.steps,
      };

      setMessages((prev) => [...prev, assistantMessage]);
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          id: (Date.now() + 1).toString(),
          role: 'assistant',
          content: 'Error: Failed to get response.',
          timestamp: new Date(),
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex h-[calc(100vh-3rem)]">
      {/* Conversation sidebar */}
      {showHistory && (
        <ConversationList
          activeId={conversationId}
          onSelect={(id) => loadConversation(id)}
          onNewChat={startNewChat}
        />
      )}

      {/* Main chat area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setShowHistory((v) => !v)}
              className="text-zinc-400 hover:text-zinc-200 text-sm px-3 py-1.5 rounded-lg border border-zinc-800 hover:border-zinc-700 transition-colors"
            >
              {showHistory ? 'Hide History' : 'History'}
            </button>
            <h2 className="text-2xl font-bold">Chat with {agentName}</h2>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm text-zinc-400 font-medium">Model:</span>
            <select
              value={model}
              onChange={(e) => setModel(e.target.value)}
              className="bg-zinc-900 border border-zinc-700 text-zinc-200 text-sm rounded-lg px-3 py-1.5 hover:border-zinc-600 focus:outline-none focus:border-blue-500 transition-colors font-medium"
            >
              <option value="haiku">Haiku</option>
              <option value="sonnet">Sonnet</option>
              <option value="opus">Opus</option>
            </select>
          </div>
        </div>

        {/* Messages area */}
        <div className="flex-1 bg-gradient-to-b from-blue-950/40 via-zinc-900 to-indigo-950/30 rounded-xl border border-zinc-800 p-4 overflow-y-auto mb-4">
          {/* Welcome screen */}
          {messages.length === 0 && !loading && (
            <div className="flex flex-col items-center justify-center h-full gap-6">
              <MurphAvatar size={80} />
              {quote && (
                <blockquote className="text-zinc-400 italic text-center max-w-md text-lg">
                  &ldquo;{quote}&rdquo;
                </blockquote>
              )}
              <p className="text-zinc-500 text-sm">How can I help you today?</p>
            </div>
          )}

          {/* Message list */}
          {messages.map((msg) => (
            <div key={msg.id} className="mb-4">
              {msg.role === 'user' ? (
                <div className="flex justify-end gap-3">
                  <div className="max-w-[80%]">
                    <div className="bg-blue-600 text-white px-4 py-2 rounded-lg">
                      <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                    </div>
                    <p className="text-xs text-zinc-500 mt-1 text-right">
                      {msg.timestamp.toLocaleTimeString()}
                    </p>
                  </div>
                  <UserAvatar />
                </div>
              ) : (
                <div className="flex justify-start gap-3">
                  <MurphAvatar />
                  <div className="max-w-[80%] min-w-0">
                    <MarkdownMessage content={msg.content} />
                    {msg.steps && msg.steps.length > 0 && <ActionSteps steps={msg.steps} />}
                    <p className="text-xs text-zinc-500 mt-1">
                      {msg.timestamp.toLocaleTimeString()}
                    </p>
                  </div>
                </div>
              )}
            </div>
          ))}

          {/* Thinking indicator */}
          {loading && (
            <div className="flex justify-start gap-3 mb-4">
              <MurphAvatar />
              <div className="bg-zinc-800 px-4 py-3 rounded-lg flex items-center gap-1.5">
                <span className="w-2 h-2 bg-zinc-400 rounded-full animate-murph-bounce [animation-delay:-0.32s]" />
                <span className="w-2 h-2 bg-zinc-400 rounded-full animate-murph-bounce [animation-delay:-0.16s]" />
                <span className="w-2 h-2 bg-zinc-400 rounded-full animate-murph-bounce" />
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input area */}
        <div className="flex gap-2 items-end">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendMessage();
              }
            }}
            placeholder="Type a message..."
            rows={1}
            className="flex-1 bg-zinc-900 border border-zinc-800 rounded-lg px-4 py-3 text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-zinc-600 resize-none overflow-hidden"
            disabled={loading}
          />
          <button
            onClick={sendMessage}
            disabled={loading || !input.trim()}
            className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 px-6 py-3 rounded-lg text-sm font-medium transition-colors"
          >
            Send
          </button>
        </div>
      </div>
    </div>
  );
}
