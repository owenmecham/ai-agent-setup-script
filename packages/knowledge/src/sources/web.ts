import { createHash } from 'node:crypto';
import { BaseSource, type KnowledgeDocument, type KnowledgeSourceConfig } from './base-source.js';

export class WebSource extends BaseSource {
  readonly name = 'web';

  async init(_config: KnowledgeSourceConfig): Promise<void> {}

  async *ingest(): AsyncGenerator<KnowledgeDocument> {
    // Web source is used on-demand
  }

  async stop(): Promise<void> {}

  async processUrl(url: string): Promise<KnowledgeDocument> {
    const response = await fetch(url);
    const html = await response.text();
    const cheerio = await import('cheerio');
    const $ = cheerio.load(html);

    // Remove scripts, styles, nav, footer
    $('script, style, nav, footer, header, aside').remove();

    const title = $('title').text() || $('h1').first().text() || url;
    const content = $('body').text().replace(/\s+/g, ' ').trim();
    const hash = createHash('sha256').update(content).digest('hex');

    return {
      source: 'web',
      sourcePath: url,
      title,
      content,
      contentHash: hash,
      metadata: {
        url,
        fetchedAt: new Date().toISOString(),
      },
    };
  }
}
