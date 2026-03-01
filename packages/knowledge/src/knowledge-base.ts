import type { Pool } from 'pg';
import { chunkText } from './chunker.js';
import type { KnowledgeDocument } from './sources/base-source.js';
import { ObsidianSource } from './sources/obsidian.js';
import { GranolaSource } from './sources/granola.js';
import { PlaudSource } from './sources/plaud.js';
import { PdfSource } from './sources/pdf.js';
import { WebSource } from './sources/web.js';

export interface KnowledgeConfig {
  sources: {
    obsidian?: { enabled: boolean; vault_path: string; watch: boolean };
    granola?: { enabled: boolean };
    plaud?: { enabled: boolean };
  };
  ollamaUrl: string;
  embeddingModel: string;
}

export class KnowledgeBase {
  private pool: Pool;
  private config: KnowledgeConfig;
  private obsidian: ObsidianSource;
  private granola: GranolaSource;
  private plaud: PlaudSource;
  private pdf: PdfSource;
  private web: WebSource;

  constructor(pool: Pool, config: KnowledgeConfig) {
    this.pool = pool;
    this.config = config;
    this.obsidian = new ObsidianSource();
    this.granola = new GranolaSource();
    this.plaud = new PlaudSource();
    this.pdf = new PdfSource();
    this.web = new WebSource();
  }

  async start(): Promise<void> {
    // Initialize enabled sources
    if (this.config.sources.obsidian?.enabled) {
      await this.obsidian.init(this.config.sources.obsidian);
      this.obsidian.onDocument((doc) => this.indexDocument(doc));

      // Full sync on startup
      for await (const doc of this.obsidian.ingest()) {
        await this.indexDocument(doc);
      }

      // Start file watcher
      this.obsidian.startWatching();
    }

    if (this.config.sources.granola?.enabled) {
      await this.granola.init(this.config.sources.granola);
      for await (const doc of this.granola.ingest()) {
        await this.indexDocument(doc);
      }
    }

    if (this.config.sources.plaud?.enabled) {
      await this.plaud.init(this.config.sources.plaud);
      for await (const doc of this.plaud.ingest()) {
        await this.indexDocument(doc);
      }
    }
  }

  async stop(): Promise<void> {
    await this.obsidian.stop();
    await this.granola.stop();
    await this.plaud.stop();
  }

  async indexDocument(doc: KnowledgeDocument): Promise<void> {
    // Check if document already indexed with same hash
    const existing = await this.pool.query(
      `SELECT id FROM knowledge_documents WHERE source = $1 AND source_path = $2 AND content_hash = $3`,
      [doc.source, doc.sourcePath, doc.contentHash],
    );

    if (existing.rows.length > 0) return; // Already indexed, skip

    // Delete old version if exists
    await this.pool.query(
      `DELETE FROM knowledge_documents WHERE source = $1 AND source_path = $2`,
      [doc.source, doc.sourcePath],
    );

    // Insert document
    const docResult = await this.pool.query(
      `INSERT INTO knowledge_documents (source, source_path, title, content_hash, metadata)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id`,
      [doc.source, doc.sourcePath, doc.title, doc.contentHash, JSON.stringify(doc.metadata)],
    );
    const docId = docResult.rows[0].id;

    // Chunk content
    const chunks = chunkText(doc.content, { maxChunkSize: 1000, overlap: 200 });

    // Embed and store chunks
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      let embeddingStr: string | null = null;

      try {
        const response = await fetch(`${this.config.ollamaUrl}/api/embeddings`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ model: this.config.embeddingModel, prompt: chunk }),
        });
        if (response.ok) {
          const data = (await response.json()) as { embedding: number[] };
          embeddingStr = `[${data.embedding.join(',')}]`;
        }
      } catch {
        // Embedding service unavailable, store without embedding
      }

      await this.pool.query(
        `INSERT INTO knowledge_chunks (document_id, content, chunk_index, embedding)
         VALUES ($1, $2, $3, $4::vector)`,
        [docId, chunk, i, embeddingStr],
      );
    }
  }

  async ingestPdf(filePath: string): Promise<void> {
    const doc = await this.pdf.processFile(filePath);
    await this.indexDocument(doc);
  }

  async ingestUrl(url: string): Promise<void> {
    const doc = await this.web.processUrl(url);
    await this.indexDocument(doc);
  }

  async search(query: string, limit: number = 5): Promise<Array<{
    id: string;
    documentTitle: string;
    content: string;
    source: string;
    similarity: number;
  }>> {
    try {
      const response = await fetch(`${this.config.ollamaUrl}/api/embeddings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: this.config.embeddingModel, prompt: query }),
      });

      if (!response.ok) return [];

      const data = (await response.json()) as { embedding: number[] };
      const embeddingStr = `[${data.embedding.join(',')}]`;

      const result = await this.pool.query(
        `SELECT kc.id, kd.title AS document_title, kc.content, kd.source,
                1 - (kc.embedding <=> $1::vector) AS similarity
         FROM knowledge_chunks kc
         JOIN knowledge_documents kd ON kc.document_id = kd.id
         WHERE kc.embedding IS NOT NULL
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
    } catch {
      return [];
    }
  }

  async listDocuments(source?: string): Promise<Array<{
    id: string;
    source: string;
    title: string;
    sourcePath: string | null;
    indexedAt: Date;
  }>> {
    const query = source
      ? `SELECT id, source, title, source_path, indexed_at FROM knowledge_documents WHERE source = $1 ORDER BY indexed_at DESC`
      : `SELECT id, source, title, source_path, indexed_at FROM knowledge_documents ORDER BY indexed_at DESC`;
    const params = source ? [source] : [];
    const result = await this.pool.query(query, params);

    return result.rows.map((row: Record<string, unknown>) => ({
      id: row.id as string,
      source: row.source as string,
      title: row.title as string,
      sourcePath: row.source_path as string | null,
      indexedAt: row.indexed_at as Date,
    }));
  }

  async deleteDocument(documentId: string): Promise<void> {
    await this.pool.query(`DELETE FROM knowledge_documents WHERE id = $1`, [documentId]);
  }
}
