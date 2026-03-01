import type { Pool } from 'pg';

export interface StoredMessage {
  id: string;
  conversationId: string;
  sender: string;
  content: string;
  channel: string;
  timestamp: Date;
  metadata?: Record<string, unknown>;
}

export interface StoredEntity {
  id: string;
  name: string;
  type: string;
  attributes: Record<string, unknown>;
  firstSeen: Date;
  lastSeen: Date;
}

export class LongTermMemory {
  constructor(private pool: Pool) {}

  async storeMessage(message: StoredMessage): Promise<void> {
    await this.pool.query(
      `INSERT INTO messages (id, conversation_id, sender, content, channel, timestamp, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (id) DO NOTHING`,
      [
        message.id,
        message.conversationId,
        message.sender,
        message.content,
        message.channel,
        message.timestamp,
        JSON.stringify(message.metadata ?? {}),
      ],
    );
  }

  async getMessages(conversationId: string, limit: number = 50): Promise<StoredMessage[]> {
    const result = await this.pool.query(
      `SELECT * FROM messages WHERE conversation_id = $1 ORDER BY timestamp DESC LIMIT $2`,
      [conversationId, limit],
    );
    return result.rows.map(this.rowToMessage);
  }

  async storeEntity(entity: Omit<StoredEntity, 'firstSeen' | 'lastSeen'>): Promise<void> {
    await this.pool.query(
      `INSERT INTO entities (id, name, type, attributes, first_seen, last_seen)
       VALUES ($1, $2, $3, $4, NOW(), NOW())
       ON CONFLICT (id) DO UPDATE SET
         attributes = EXCLUDED.attributes,
         last_seen = NOW()`,
      [entity.id, entity.name, entity.type, JSON.stringify(entity.attributes)],
    );
  }

  async getEntities(limit: number = 10): Promise<StoredEntity[]> {
    const result = await this.pool.query(
      `SELECT * FROM entities ORDER BY last_seen DESC LIMIT $1`,
      [limit],
    );
    return result.rows.map((row: Record<string, unknown>) => ({
      id: row.id as string,
      name: row.name as string,
      type: row.type as string,
      attributes: (row.attributes ?? {}) as Record<string, unknown>,
      firstSeen: row.first_seen as Date,
      lastSeen: row.last_seen as Date,
    }));
  }

  async searchEntities(query: string, limit: number = 10): Promise<StoredEntity[]> {
    const result = await this.pool.query(
      `SELECT * FROM entities WHERE name ILIKE $1 ORDER BY last_seen DESC LIMIT $2`,
      [`%${query}%`, limit],
    );
    return result.rows.map((row: Record<string, unknown>) => ({
      id: row.id as string,
      name: row.name as string,
      type: row.type as string,
      attributes: (row.attributes ?? {}) as Record<string, unknown>,
      firstSeen: row.first_seen as Date,
      lastSeen: row.last_seen as Date,
    }));
  }

  private rowToMessage(row: Record<string, unknown>): StoredMessage {
    return {
      id: row.id as string,
      conversationId: row.conversation_id as string,
      sender: row.sender as string,
      content: row.content as string,
      channel: row.channel as string,
      timestamp: row.timestamp as Date,
      metadata: (row.metadata ?? {}) as Record<string, unknown>,
    };
  }
}
