import type { Pool } from 'pg';
import { EmbeddingClient } from './embedding.js';

export interface SemanticMemoryRecord {
  id: string;
  conversationId: string;
  summary: string;
  importance: number;
  embedding?: number[];
  createdAt: Date;
}

export class SemanticMemory {
  private embeddingClient: EmbeddingClient;

  constructor(
    private pool: Pool,
    ollamaUrl: string = 'http://localhost:11434',
    model: string = 'nomic-embed-text',
  ) {
    this.embeddingClient = new EmbeddingClient(ollamaUrl, model);
  }

  async store(record: Omit<SemanticMemoryRecord, 'id' | 'createdAt' | 'embedding'>): Promise<void> {
    const embedding = await this.embeddingClient.embed(record.summary);
    const embeddingStr = `[${embedding.join(',')}]`;

    await this.pool.query(
      `INSERT INTO memories (conversation_id, summary, importance, embedding)
       VALUES ($1, $2, $3, $4::vector)`,
      [record.conversationId, record.summary, record.importance, embeddingStr],
    );
  }

  async search(query: string, limit: number = 5): Promise<(SemanticMemoryRecord & { similarity: number })[]> {
    const embedding = await this.embeddingClient.embed(query);
    const embeddingStr = `[${embedding.join(',')}]`;

    const result = await this.pool.query(
      `SELECT id, conversation_id, summary, importance, created_at,
              1 - (embedding <=> $1::vector) AS similarity
       FROM memories
       ORDER BY embedding <=> $1::vector
       LIMIT $2`,
      [embeddingStr, limit],
    );

    return result.rows.map((row: Record<string, unknown>) => ({
      id: row.id as string,
      conversationId: row.conversation_id as string,
      summary: row.summary as string,
      importance: row.importance as number,
      createdAt: row.created_at as Date,
      similarity: row.similarity as number,
    }));
  }

  async getByConversation(conversationId: string, limit: number = 10): Promise<SemanticMemoryRecord[]> {
    const result = await this.pool.query(
      `SELECT id, conversation_id, summary, importance, created_at
       FROM memories
       WHERE conversation_id = $1
       ORDER BY created_at DESC
       LIMIT $2`,
      [conversationId, limit],
    );

    return result.rows.map((row: Record<string, unknown>) => ({
      id: row.id as string,
      conversationId: row.conversation_id as string,
      summary: row.summary as string,
      importance: row.importance as number,
      createdAt: row.created_at as Date,
    }));
  }
}
