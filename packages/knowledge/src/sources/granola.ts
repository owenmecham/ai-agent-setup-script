import { BaseSource, type KnowledgeDocument, type KnowledgeSourceConfig } from './base-source.js';
import { createHash } from 'node:crypto';

export class GranolaSource extends BaseSource {
  readonly name = 'granola';
  private mcpClient: unknown = null;

  async init(config: KnowledgeSourceConfig): Promise<void> {
    // MCP client connection will be injected by the knowledge-base
  }

  setMcpClient(client: unknown): void {
    this.mcpClient = client;
  }

  async *ingest(): AsyncGenerator<KnowledgeDocument> {
    // Poll for meeting notes via MCP or API
    // This is a placeholder that will be connected when MCP client is available
    if (!this.mcpClient) return;

    // When MCP is available, call the granola list-meetings tool
    // and iterate through results
  }

  async stop(): Promise<void> {
    this.mcpClient = null;
  }

  processRawNote(note: {
    id: string;
    title: string;
    content: string;
    date: string;
    participants?: string[];
  }): KnowledgeDocument {
    const hash = createHash('sha256').update(note.content).digest('hex');
    return {
      source: 'granola',
      sourcePath: note.id,
      title: note.title,
      content: note.content,
      contentHash: hash,
      metadata: {
        date: note.date,
        participants: note.participants ?? [],
      },
    };
  }
}
