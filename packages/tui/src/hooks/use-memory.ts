import { useState, useEffect, useCallback } from 'react';
import { getIPCClient } from './use-agent.js';

export interface Conversation {
  id: string;
  channel: string;
  participants: string[];
  messageCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface EntityRecord {
  id: string;
  name: string;
  type: string;
  attributes: Record<string, unknown>;
  firstSeen: string;
  lastSeen: string;
}

export interface SemanticMemoryRecord {
  id: string;
  summary: string;
  importance: number;
  createdAt: string;
}

export function useMemory() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [entities, setEntities] = useState<EntityRecord[]>([]);
  const [semanticMemories, setSemanticMemories] = useState<SemanticMemoryRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const client = getIPCClient();

  const refresh = useCallback(async () => {
    if (!client.connected) return;
    try {
      setLoading(true);
      const [convs, ents, mems] = await Promise.all([
        client.call('memory.conversations') as Promise<Conversation[]>,
        client.call('memory.entities') as Promise<EntityRecord[]>,
        client.call('memory.semanticSearch', { query: '', limit: 20 }) as Promise<SemanticMemoryRecord[]>,
      ]);
      setConversations(convs ?? []);
      setEntities(ents ?? []);
      setSemanticMemories(mems ?? []);
    } catch {
      // Ignore errors during refresh
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { conversations, entities, semanticMemories, loading, refresh };
}
