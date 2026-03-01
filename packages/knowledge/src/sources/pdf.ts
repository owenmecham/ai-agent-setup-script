import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { basename } from 'node:path';
import { BaseSource, type KnowledgeDocument, type KnowledgeSourceConfig } from './base-source.js';

export class PdfSource extends BaseSource {
  readonly name = 'pdf';

  async init(_config: KnowledgeSourceConfig): Promise<void> {}

  async *ingest(): AsyncGenerator<KnowledgeDocument> {
    // PDF source is used on-demand, not for batch ingestion
  }

  async stop(): Promise<void> {}

  async processFile(filePath: string): Promise<KnowledgeDocument> {
    const buffer = await readFile(filePath);
    const { extractText } = await import('unpdf');
    const result = await extractText(buffer);
    const content = Array.isArray(result.text) ? result.text.join('\n') : result.text;
    const hash = createHash('sha256').update(content).digest('hex');

    return {
      source: 'pdf',
      sourcePath: filePath,
      title: basename(filePath, '.pdf'),
      content,
      contentHash: hash,
      metadata: { originalPath: filePath },
    };
  }
}
