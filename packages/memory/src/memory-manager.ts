import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { ShortTermMemory } from './short-term.js';
import { LongTermMemory } from './long-term.js';
import { SemanticMemory } from './semantic.js';
import { compressContext } from './compressor.js';

export interface MemoryConfig {
  databaseUrl: string;
  shortTermBufferSize: number;
  flushIntervalSeconds: number;
  semanticSearchLimit: number;
  knowledgeSearchLimit: number;
  maxContextTokens: number;
  ollamaUrl: string;
  embeddingModel: string;
}

export class MemoryManager {
  private pool: Pool;
  private shortTerm: ShortTermMemory;
  private longTerm: LongTermMemory;
  private semantic: SemanticMemory;
  private flushInterval: ReturnType<typeof setInterval> | null = null;
  private config: MemoryConfig;

  constructor(config: MemoryConfig) {
    this.config = config;
    this.pool = new Pool({ connectionString: config.databaseUrl });
    this.shortTerm = new ShortTermMemory(config.shortTermBufferSize);
    this.longTerm = new LongTermMemory(this.pool);
    this.semantic = new SemanticMemory(this.pool, config.ollamaUrl, config.embeddingModel);
  }

  getPool(): Pool {
    return this.pool;
  }

  async start(): Promise<void> {
    // Start periodic flush of short-term to long-term
    this.flushInterval = setInterval(
      () => this.flushToLongTerm(),
      this.config.flushIntervalSeconds * 1000,
    );
  }

  async stop(): Promise<void> {
    if (this.flushInterval) {
      clearInterval(this.flushInterval);
    }
    await this.flushToLongTerm();
    await this.pool.end();
  }

  async getContext(conversationId: string, maxTokens: number) {
    // Gather from all tiers
    const recentMessages = this.shortTerm.getRecent(conversationId, 10).map((m) => ({
      id: m.id,
      conversationId: m.conversationId,
      sender: m.sender,
      content: m.content,
      timestamp: m.timestamp,
      channel: m.channel as 'telegram' | 'imessage' | 'dashboard' | 'scheduler' | 'system',
    }));

    // If short-term is empty, try long-term
    if (recentMessages.length === 0) {
      const ltMessages = await this.longTerm.getMessages(conversationId, 10);
      recentMessages.push(
        ...ltMessages.map((m) => ({
          ...m,
          channel: m.channel as 'telegram' | 'imessage' | 'dashboard' | 'scheduler' | 'system',
        })),
      );
    }

    // Get last message content for semantic search
    const lastMessage = recentMessages[recentMessages.length - 1];
    const searchQuery = lastMessage?.content ?? '';

    let semanticMemories: Array<{ id: string; summary: string; importance: number; createdAt: Date; similarity?: number }> = [];
    let knowledgeChunks: Array<{ id: string; documentTitle: string; content: string; source: string; similarity: number }> = [];

    if (searchQuery) {
      try {
        semanticMemories = await this.semantic.search(searchQuery, this.config.semanticSearchLimit);
      } catch {
        // Embedding service may not be available
      }

      try {
        knowledgeChunks = await this.searchKnowledge(searchQuery, this.config.knowledgeSearchLimit);
      } catch {
        // Knowledge search may fail
      }
    }

    const entities = await this.longTerm.getEntities(10);

    // Compress to fit token budget
    return compressContext(
      {
        recentMessages: recentMessages.map((m) => ({
          sender: m.sender,
          content: m.content,
          timestamp: m.timestamp,
        })),
        semanticMemories: semanticMemories.map((m) => ({
          summary: m.summary,
          importance: m.importance,
        })),
        knowledgeChunks,
        entities: entities.map((e) => ({
          name: e.name,
          type: e.type,
        })),
      },
      maxTokens,
    );
  }

  async store(
    message: { id: string; conversationId: string; sender: string; content: string; channel: string; timestamp: Date },
    response: string,
    _actions: unknown[],
    _results: unknown[],
  ): Promise<void> {
    const responseId = randomUUID();

    // Add to short-term buffer
    this.shortTerm.add({
      id: message.id,
      conversationId: message.conversationId,
      sender: message.sender,
      content: message.content,
      timestamp: message.timestamp,
      channel: message.channel,
    });

    // Also add the assistant response
    this.shortTerm.add({
      id: responseId,
      conversationId: message.conversationId,
      sender: 'murph',
      content: response,
      timestamp: new Date(),
      channel: message.channel,
    });

    // Immediately store to long-term as well
    await this.longTerm.storeMessage({
      id: message.id,
      conversationId: message.conversationId,
      sender: message.sender,
      content: message.content,
      channel: message.channel,
      timestamp: message.timestamp,
    });

    await this.longTerm.storeMessage({
      id: responseId,
      conversationId: message.conversationId,
      sender: 'murph',
      content: response,
      channel: message.channel,
      timestamp: new Date(),
    });

    // Store semantic memory (summary of the exchange)
    try {
      await this.semantic.store({
        conversationId: message.conversationId,
        summary: `User: ${message.content.slice(0, 200)}\nMurph: ${response.slice(0, 200)}`,
        importance: 0.5,
      });
    } catch {
      // Embedding service may not be available
    }
  }

  private async searchKnowledge(
    query: string,
    limit: number,
  ): Promise<Array<{ id: string; documentTitle: string; content: string; source: string; similarity: number }>> {
    // This queries the knowledge_chunks table with pgvector
    const { EmbeddingClient } = await import('./embedding.js');
    const client = new EmbeddingClient(this.config.ollamaUrl, this.config.embeddingModel);
    const embedding = await client.embed(query);
    const embeddingStr = `[${embedding.join(',')}]`;

    const result = await this.pool.query(
      `SELECT kc.id, kd.title AS document_title, kc.content, kd.source,
              1 - (kc.embedding <=> $1::vector) AS similarity
       FROM knowledge_chunks kc
       JOIN knowledge_documents kd ON kc.document_id = kd.id
       ORDER BY kc.embedding <=> $1::vector
       LIMIT $2`,
      [embeddingStr, limit],
    );

    return result.rows.map((row: Record<string, unknown>) => ({
      id: row.id as string,
      documentTitle: (row.document_title ?? 'Unknown') as string,
      content: row.content as string,
      source: row.source as string,
      similarity: row.similarity as number,
    }));
  }

  private async flushToLongTerm(): Promise<void> {
    const allMessages = this.shortTerm.getAll();
    for (const msg of allMessages) {
      try {
        await this.longTerm.storeMessage({
          id: msg.id,
          conversationId: msg.conversationId,
          sender: msg.sender,
          content: msg.content,
          channel: msg.channel,
          timestamp: msg.timestamp,
        });
      } catch {
        // Ignore duplicates
      }
    }
  }
}
