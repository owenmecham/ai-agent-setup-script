import { readFile, readdir, stat } from 'node:fs/promises';
import { join, relative, basename, extname } from 'node:path';
import { createHash } from 'node:crypto';
import { watch } from 'chokidar';
import type { FSWatcher } from 'chokidar';
import { BaseSource, type KnowledgeDocument, type KnowledgeSourceConfig } from './base-source.js';

interface ObsidianConfig extends KnowledgeSourceConfig {
  vault_path: string;
  watch: boolean;
}

export class ObsidianSource extends BaseSource {
  readonly name = 'obsidian';
  private vaultPath = '';
  private watcher: FSWatcher | null = null;
  private watchEnabled = true;
  private changeQueue: string[] = [];
  private onDocumentCallback?: (doc: KnowledgeDocument) => Promise<void>;

  async init(config: KnowledgeSourceConfig): Promise<void> {
    const obsConfig = config as ObsidianConfig;
    this.vaultPath = obsConfig.vault_path;
    this.watchEnabled = obsConfig.watch ?? true;
  }

  onDocument(callback: (doc: KnowledgeDocument) => Promise<void>): void {
    this.onDocumentCallback = callback;
  }

  async *ingest(): AsyncGenerator<KnowledgeDocument> {
    const files = await this.findMarkdownFiles(this.vaultPath);
    for (const filePath of files) {
      const doc = await this.processFile(filePath);
      if (doc) yield doc;
    }
  }

  startWatching(): void {
    if (!this.watchEnabled || !this.vaultPath) return;

    this.watcher = watch(join(this.vaultPath, '**/*.md'), {
      ignoreInitial: true,
      ignored: /(^|[\/\\])\../,
    });

    this.watcher.on('add', (path) => this.handleFileChange(path));
    this.watcher.on('change', (path) => this.handleFileChange(path));
  }

  async stop(): Promise<void> {
    if (this.watcher) {
      await this.watcher.close();
      this.watcher = null;
    }
  }

  private async handleFileChange(filePath: string): Promise<void> {
    const doc = await this.processFile(filePath);
    if (doc && this.onDocumentCallback) {
      await this.onDocumentCallback(doc);
    }
  }

  private async processFile(filePath: string): Promise<KnowledgeDocument | null> {
    try {
      const content = await readFile(filePath, 'utf-8');
      const hash = createHash('sha256').update(content).digest('hex');
      const { frontmatter, body } = this.parseFrontmatter(content);
      const title = (frontmatter.title as string | undefined) ?? basename(filePath, extname(filePath));
      const relativePath = relative(this.vaultPath, filePath);

      return {
        source: 'obsidian',
        sourcePath: relativePath,
        title,
        content: body,
        contentHash: hash,
        metadata: {
          ...frontmatter,
          wikiLinks: this.extractWikiLinks(body),
          tags: this.extractTags(content),
        },
      };
    } catch {
      return null;
    }
  }

  private parseFrontmatter(content: string): { frontmatter: Record<string, unknown>; body: string } {
    const match = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
    if (!match) {
      return { frontmatter: {}, body: content };
    }

    try {
      // Simple YAML frontmatter parsing
      const yaml = require('yaml');
      const frontmatter = yaml.parse(match[1]) ?? {};
      return { frontmatter, body: match[2] };
    } catch {
      return { frontmatter: {}, body: content };
    }
  }

  private extractWikiLinks(content: string): string[] {
    const links: string[] = [];
    const regex = /\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g;
    let match;
    while ((match = regex.exec(content)) !== null) {
      links.push(match[1]);
    }
    return links;
  }

  private extractTags(content: string): string[] {
    const tags: string[] = [];
    const regex = /(?:^|\s)#([a-zA-Z][\w/]*)/g;
    let match;
    while ((match = regex.exec(content)) !== null) {
      tags.push(match[1]);
    }
    return tags;
  }

  private async findMarkdownFiles(dir: string): Promise<string[]> {
    const files: string[] = [];
    try {
      const entries = await readdir(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.name.startsWith('.')) continue;
        const fullPath = join(dir, entry.name);
        if (entry.isDirectory()) {
          files.push(...await this.findMarkdownFiles(fullPath));
        } else if (entry.name.endsWith('.md')) {
          files.push(fullPath);
        }
      }
    } catch {
      // Directory may not exist
    }
    return files;
  }
}
