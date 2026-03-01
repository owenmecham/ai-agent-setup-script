import { BaseSource, type KnowledgeDocument, type KnowledgeSourceConfig } from './base-source.js';
import { createHash } from 'node:crypto';

export class PlaudSource extends BaseSource {
  readonly name = 'plaud';
  private mcpClient: unknown = null;

  async init(config: KnowledgeSourceConfig): Promise<void> {
    // MCP client connection will be injected
  }

  setMcpClient(client: unknown): void {
    this.mcpClient = client;
  }

  async *ingest(): AsyncGenerator<KnowledgeDocument> {
    if (!this.mcpClient) return;
    // Poll for transcriptions via MCP
  }

  async stop(): Promise<void> {
    this.mcpClient = null;
  }

  processRawTranscription(transcription: {
    id: string;
    title: string;
    content: string;
    date: string;
    duration?: number;
  }): KnowledgeDocument {
    const hash = createHash('sha256').update(transcription.content).digest('hex');
    return {
      source: 'plaud',
      sourcePath: transcription.id,
      title: transcription.title,
      content: transcription.content,
      contentHash: hash,
      metadata: {
        date: transcription.date,
        duration: transcription.duration,
      },
    };
  }
}
