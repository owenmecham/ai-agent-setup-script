'use client';

import { useQuery } from '@tanstack/react-query';

interface ConversationSummary {
  id: string;
  preview: string;
  messageCount: number;
  lastMessageAt: string;
}

export function ConversationList({
  activeId,
  onSelect,
  onNewChat,
}: {
  activeId: string | null;
  onSelect: (id: string) => void;
  onNewChat: () => void;
}) {
  const { data: conversations, isLoading } = useQuery<ConversationSummary[]>({
    queryKey: ['conversations'],
    queryFn: async () => {
      const res = await fetch('/api/chat/conversations');
      if (!res.ok) return [];
      return res.json();
    },
    refetchInterval: 30000,
  });

  return (
    <div className="w-72 border-r border-zinc-800 flex flex-col h-full bg-zinc-950">
      <div className="p-3 border-b border-zinc-800">
        <button
          onClick={onNewChat}
          className="w-full bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium py-2 px-3 rounded-lg transition-colors"
        >
          + New Chat
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {isLoading && (
          <p className="text-zinc-500 text-sm text-center mt-4">Loading...</p>
        )}
        {!isLoading && (!conversations || conversations.length === 0) && (
          <p className="text-zinc-500 text-sm text-center mt-4">No previous chats</p>
        )}
        {conversations?.map((conv) => (
          <button
            key={conv.id}
            onClick={() => onSelect(conv.id)}
            className={`w-full text-left px-3 py-3 border-b border-zinc-800/50 hover:bg-zinc-900 transition-colors ${
              activeId === conv.id ? 'bg-zinc-900' : ''
            }`}
          >
            <p className="text-sm text-zinc-200 truncate">{conv.preview}</p>
            <div className="flex justify-between mt-1">
              <span className="text-xs text-zinc-500">
                {conv.messageCount} message{conv.messageCount !== 1 ? 's' : ''}
              </span>
              <span className="text-xs text-zinc-500">
                {new Date(conv.lastMessageAt).toLocaleDateString()}
              </span>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
