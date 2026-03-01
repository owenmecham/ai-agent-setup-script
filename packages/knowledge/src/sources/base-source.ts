export interface KnowledgeDocument {
  source: string;
  sourcePath?: string;
  title: string;
  content: string;
  contentHash: string;
  metadata: Record<string, unknown>;
}

export interface KnowledgeSourceConfig {
  enabled: boolean;
  [key: string]: unknown;
}

export abstract class BaseSource {
  abstract readonly name: string;

  abstract init(config: KnowledgeSourceConfig): Promise<void>;
  abstract ingest(): AsyncGenerator<KnowledgeDocument>;
  abstract stop(): Promise<void>;

  protected computeHash(content: string): string {
    const crypto = require('node:crypto');
    return crypto.createHash('sha256').update(content).digest('hex');
  }
}
