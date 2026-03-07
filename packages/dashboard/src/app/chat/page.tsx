'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { MurphAvatar, UserAvatar } from '../../components/chat-avatars';
import { MarkdownMessage } from '../../components/markdown-message';
import { ConversationList } from '../../components/conversation-list';

const INTERSTELLAR_QUOTES = [
  'Do not go gentle into that good night.',
  'We used to look up at the sky and wonder at our place in the stars, now we just look down and worry about our place in the dirt.',
  'Mankind was born on Earth. It was never meant to die here.',
  'Love is the one thing we\'re capable of perceiving that transcends dimensions of time and space.',
  'We\'ve always defined ourselves by the ability to overcome the impossible.',
  'Murphy\'s law doesn\'t mean that something bad will happen. It means that whatever can happen, will happen.',
  'I\'m not afraid of death. I\'m an old physicist. I\'m afraid of time.',
  'Maybe we\'ve spent too long trying to figure all this out with theory.',
  'This world\'s a treasure, but it\'s been telling us to leave for a while now.',
  '"It\'s not possible." "No. It\'s necessary."',
  'Newton\'s third law. You\'ve got to leave something behind.',
  'Once you\'re a parent, you\'re the ghost of your children\'s future.',
  'We must reach far beyond our own lifespans. We must think not as individuals but as a species.',
  'Our survival instinct is our single greatest source of inspiration.',
  'Time is relative, okay? It can stretch and it can squeeze, but it can\'t run backwards.',
  'Accident is the first building block of evolution.',
  'Love isn\'t something that we invented. It\'s observable, powerful.',
  'We\'re still pioneers, we barely begun. Our greatest accomplishments cannot be behind us, cause our destiny lies above us.',
  'We\'ll find a way, Professor. We always have.',
  'Mankind\'s next step will be our greatest.',
  'Don\'t trust the right thing done for the wrong reason. The why of the thing, that\'s the foundation.',
  'You said science was about admitting what we don\'t know.',
  'We didn\'t run out of television screens and planes. We ran out of food.',
  'You might have to decide between seeing your children again and the future of the human race.',
  'We must confront the reality that nothing in our solar system can help us.',
  'We\'re not meant to save the world. We\'re meant to leave it.',
  'Don\'t judge me, Cooper. You were never tested like I was. Few men have been.',
  'Absolute honesty isn\'t always the most diplomatic nor the safest form of communication with emotional beings.',
  'He knew how hard it would be to get people to work together to save the species instead of themselves.',
  'I don\'t care much for this pretending. We\'re back where we started. I want to know where we are. Where we\'re going.',
  'Let me go home.',
  'There are some things that aren\'t meant to be known.',
  'A machine doesn\'t improvise well because you cannot program a fear of death.',
  'I stopped believing you were coming back. Something seemed wrong about dreaming my life away.',
  'When I was a kid, it seemed like they made something new every day.',
  'She\'s out there. Setting up camp. Alone, in a strange galaxy. Perhaps right now she\'s settling in for the long nap.',
  'Rage, rage against the dying of the light.',
  'Every hour we spend on that planet will be seven years back on Earth.',
  'Those aren\'t mountains. They\'re waves.',
  'Today is my birthday. And it\'s a special one because you once told me that when you came back, we might be the same age.',
  'I have a cue light I can use to show you when I\'m joking, if you like.',
  'Parents are the ghosts of their children\'s future. I can\'t be your ghost anymore, Murph.',
  'Cooper, this is no time for caution.',
  'You have Murphy\'s fire, Amelia.',
  'The only thing that can move across dimensions like time is gravity.',
  'We are the future.',
  'Step out of the shadow. Find something new to orbit.',
  'It\'s like we\'ve forgotten who we are. Explorers, pioneers, not caretakers.',
  'Nature can\'t be evil. Nature is formidable but it isn\'t evil.',
  'That\'s what I love. You say science is about admitting what we don\'t know.',
];

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

export default function ChatPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [quote] = useState(() => INTERSTELLAR_QUOTES[Math.floor(Math.random() * INTERSTELLAR_QUOTES.length)]);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

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
        body: JSON.stringify({ message: input, conversationId: activeConversationId }),
      });

      const data = await response.json();
      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: data.response ?? 'No response',
        timestamp: new Date(),
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
            <h2 className="text-2xl font-bold">Chat with Murph</h2>
          </div>
        </div>

        {/* Messages area */}
        <div className="flex-1 bg-zinc-900 rounded-xl border border-zinc-800 p-4 overflow-y-auto mb-4">
          {/* Welcome screen */}
          {messages.length === 0 && !loading && (
            <div className="flex flex-col items-center justify-center h-full gap-6">
              <MurphAvatar size={80} />
              <blockquote className="text-zinc-400 italic text-center max-w-md text-lg">
                &ldquo;{quote}&rdquo;
              </blockquote>
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
                  <div className="max-w-[80%]">
                    <div className="bg-zinc-800 px-4 py-2 rounded-lg">
                      <MarkdownMessage content={msg.content} />
                    </div>
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
        <div className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && sendMessage()}
            placeholder="Type a message..."
            className="flex-1 bg-zinc-900 border border-zinc-800 rounded-lg px-4 py-3 text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-zinc-600"
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
