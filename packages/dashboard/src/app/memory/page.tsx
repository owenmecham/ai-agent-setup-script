'use client';

import { useQuery } from '@tanstack/react-query';

interface Conversation {
  id: string;
  channel: string;
  participants: string[];
  messageCount: number;
  createdAt: string;
  updatedAt: string;
}

interface Entity {
  id: string;
  name: string;
  type: string;
  attributes: Record<string, unknown>;
  firstSeen: string;
  lastSeen: string;
}

interface SemanticMemory {
  id: string;
  summary: string;
  importance: number;
  createdAt: string;
}

export default function MemoryPage() {
  const { data: conversations } = useQuery({
    queryKey: ['memory-conversations'],
    queryFn: async () => {
      const res = await fetch('/api/memory/conversations');
      return res.json() as Promise<Conversation[]>;
    },
  });

  const { data: entities } = useQuery({
    queryKey: ['memory-entities'],
    queryFn: async () => {
      const res = await fetch('/api/memory/entities');
      return res.json() as Promise<Entity[]>;
    },
  });

  const { data: memories } = useQuery({
    queryKey: ['memory-semantic'],
    queryFn: async () => {
      const res = await fetch('/api/memory/semantic');
      return res.json() as Promise<SemanticMemory[]>;
    },
  });

  return (
    <div>
      <h2 className="text-2xl font-bold mb-6">Memory</h2>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-zinc-900 rounded-xl border border-zinc-800 p-6">
          <h3 className="text-lg font-semibold mb-4">Recent Conversations</h3>
          {!conversations?.length ? (
            <p className="text-zinc-500 text-sm">No conversations yet.</p>
          ) : (
            <div className="space-y-2">
              {conversations.map((conv) => (
                <div key={conv.id} className="flex items-center justify-between py-2 border-b border-zinc-800/50">
                  <div>
                    <span className="text-sm text-zinc-300 capitalize">{conv.channel}</span>
                    <span className="text-xs text-zinc-600 ml-2">{conv.messageCount} messages</span>
                  </div>
                  <span className="text-xs text-zinc-500">
                    {new Date(conv.updatedAt).toLocaleString()}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="bg-zinc-900 rounded-xl border border-zinc-800 p-6">
          <h3 className="text-lg font-semibold mb-4">Known Entities</h3>
          {!entities?.length ? (
            <p className="text-zinc-500 text-sm">No entities stored yet.</p>
          ) : (
            <div className="space-y-2">
              {entities.map((entity) => (
                <div key={entity.id} className="flex items-center justify-between py-2 border-b border-zinc-800/50">
                  <div>
                    <span className="text-sm font-medium text-zinc-300">{entity.name}</span>
                    <span className="text-xs text-zinc-600 ml-2">{entity.type}</span>
                  </div>
                  <span className="text-xs text-zinc-500">
                    {new Date(entity.lastSeen).toLocaleDateString()}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="mt-6 bg-zinc-900 rounded-xl border border-zinc-800 p-6">
        <h3 className="text-lg font-semibold mb-4">Semantic Memories</h3>
        {!memories?.length ? (
          <p className="text-zinc-500 text-sm">No semantic memories yet.</p>
        ) : (
          <div className="space-y-3">
            {memories.map((memory) => (
              <div key={memory.id} className="py-2 border-b border-zinc-800/50">
                <div className="flex items-center justify-between mb-1">
                  <span className={`text-xs px-1.5 py-0.5 rounded ${
                    memory.importance >= 8 ? 'bg-red-900 text-red-300' :
                    memory.importance >= 5 ? 'bg-yellow-900 text-yellow-300' :
                    'bg-zinc-800 text-zinc-400'
                  }`}>
                    importance: {memory.importance}
                  </span>
                  <span className="text-xs text-zinc-500">
                    {new Date(memory.createdAt).toLocaleString()}
                  </span>
                </div>
                <p className="text-sm text-zinc-300">{memory.summary}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
