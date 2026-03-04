import { EventEmitter } from 'node:events';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { Document, parseDocument, parse as parseYaml } from 'yaml';
import { MurphConfigSchema } from './schema.js';
import type { MurphConfig, DeepPartial, ConfigChangeEvent } from './types.js';

export class ConfigManager extends EventEmitter {
  private configPath: string;
  private cached: MurphConfig | null = null;
  private watcher: { close(): Promise<void> } | null = null;

  constructor(configPath?: string) {
    super();
    this.configPath = configPath ?? resolve(process.cwd(), 'murph.config.yaml');
  }

  getPath(): string {
    return this.configPath;
  }

  load(): MurphConfig {
    if (!existsSync(this.configPath)) {
      throw new Error(`Config file not found: ${this.configPath}`);
    }

    const raw = readFileSync(this.configPath, 'utf-8');
    const parsed = parseYaml(raw);
    const resolved = resolveSecrets(parsed);
    this.cached = MurphConfigSchema.parse(resolved) as MurphConfig;
    return this.cached;
  }

  get(): MurphConfig;
  get<T = unknown>(path: string): T;
  get<T = unknown>(path?: string): MurphConfig | T {
    if (!this.cached) {
      this.load();
    }

    if (!path) {
      return this.cached!;
    }

    return getByDotPath<T>(this.cached!, path);
  }

  async set(path: string, value: unknown): Promise<MurphConfig> {
    const previous = this.cached ? { ...structuredClone(this.cached) } : this.load();

    // Read existing YAML with Document API to preserve comments
    const raw = existsSync(this.configPath) ? readFileSync(this.configPath, 'utf-8') : '';
    const doc = raw ? parseDocument(raw) : new Document({});

    // Set the value at the dotpath in the document
    setInDocument(doc, path, value);

    // Parse back to validate
    const merged = doc.toJSON() ?? {};
    const resolved = resolveSecrets(merged);
    const validated = MurphConfigSchema.parse(resolved) as MurphConfig;

    // Write back preserving comments
    const dir = dirname(this.configPath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    writeFileSync(this.configPath, doc.toString({ lineWidth: 120 }), 'utf-8');

    this.cached = validated;

    const changedPaths = getChangedPaths(previous, validated);
    if (changedPaths.length > 0) {
      const event: ConfigChangeEvent = { previous, current: validated, changedPaths };
      this.emit('config:changed', event);
    }

    return validated;
  }

  async update(partial: DeepPartial<MurphConfig>): Promise<MurphConfig> {
    const previous = this.cached ? structuredClone(this.cached) : this.load();

    // Read existing YAML
    const raw = existsSync(this.configPath) ? readFileSync(this.configPath, 'utf-8') : '';
    const existing = raw ? (parseYaml(raw) ?? {}) as Record<string, unknown> : {};

    // Deep merge updates into existing raw data
    const merged = deepMerge(existing, partial as Record<string, unknown>);

    // Validate the merged config
    const resolved = resolveSecrets(merged);
    const validated = MurphConfigSchema.parse(resolved) as MurphConfig;

    // Write back
    const dir = dirname(this.configPath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }

    // Use Document API for writing to try to preserve comments
    const doc = raw ? parseDocument(raw) : new Document({});
    applyDeepToDocument(doc, partial as Record<string, unknown>);
    writeFileSync(this.configPath, doc.toString({ lineWidth: 120 }), 'utf-8');

    this.cached = validated;

    const changedPaths = getChangedPaths(previous, validated);
    if (changedPaths.length > 0) {
      const event: ConfigChangeEvent = { previous, current: validated, changedPaths };
      this.emit('config:changed', event);
    }

    return validated;
  }

  async watch(): Promise<void> {
    if (this.watcher) return;

    const { watch: chokidarWatch } = await import('chokidar');
    const w = chokidarWatch(this.configPath, {
      ignoreInitial: true,
      awaitWriteFinish: { stabilityThreshold: 200, pollInterval: 50 },
    });

    w.on('change', () => {
      try {
        const previous = this.cached ? structuredClone(this.cached) : null;
        this.load();
        if (previous && this.cached) {
          const changedPaths = getChangedPaths(previous, this.cached);
          if (changedPaths.length > 0) {
            const event: ConfigChangeEvent = { previous, current: this.cached, changedPaths };
            this.emit('config:changed', event);
          }
        }
      } catch (err) {
        this.emit('config:error', err);
      }
    });

    this.watcher = w;
  }

  async unwatch(): Promise<void> {
    if (this.watcher) {
      await this.watcher.close();
      this.watcher = null;
    }
  }

  resetCache(): void {
    this.cached = null;
  }
}

/** Resolve ${ENV_VAR} references in config values */
function resolveSecrets(obj: unknown): unknown {
  if (typeof obj === 'string') {
    return obj.replace(/\$\{(\w+)\}/g, (_match, name) => {
      return process.env[name] ?? `\${${name}}`;
    });
  }
  if (Array.isArray(obj)) {
    return obj.map(resolveSecrets);
  }
  if (obj !== null && typeof obj === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
      result[key] = resolveSecrets(value);
    }
    return result;
  }
  return obj;
}

/** Get a value from a nested object by dot-separated path */
function getByDotPath<T>(obj: Record<string, unknown>, path: string): T {
  const parts = path.split('.');
  let current: unknown = obj;
  for (const part of parts) {
    if (current === null || current === undefined || typeof current !== 'object') {
      return undefined as T;
    }
    current = (current as Record<string, unknown>)[part];
  }
  return current as T;
}

/** Set a value in a YAML Document at a dot-separated path */
function setInDocument(doc: Document, path: string, value: unknown): void {
  const parts = path.split('.');
  if (parts.length === 1) {
    doc.set(parts[0], value);
    return;
  }

  // Navigate to the parent, creating intermediary maps as needed
  let current = doc.contents;
  for (let i = 0; i < parts.length - 1; i++) {
    if (!current || typeof (current as any).get !== 'function') {
      doc.setIn(parts, value);
      return;
    }
    const next = (current as any).get(parts[i], true);
    if (!next) {
      doc.setIn(parts, value);
      return;
    }
    current = next;
  }

  const lastKey = parts[parts.length - 1];
  if (current && typeof (current as any).set === 'function') {
    (current as any).set(lastKey, value);
  } else {
    doc.setIn(parts, value);
  }
}

/** Apply a deep partial object to a YAML Document */
function applyDeepToDocument(doc: Document, partial: Record<string, unknown>, prefix: string[] = []): void {
  for (const [key, value] of Object.entries(partial)) {
    const path = [...prefix, key];
    if (
      value !== null &&
      typeof value === 'object' &&
      !Array.isArray(value)
    ) {
      applyDeepToDocument(doc, value as Record<string, unknown>, path);
    } else {
      doc.setIn(path, value);
    }
  }
}

/** Deep merge two objects */
function deepMerge(target: Record<string, unknown>, source: Record<string, unknown>): Record<string, unknown> {
  const result = { ...target };
  for (const [key, value] of Object.entries(source)) {
    if (
      value !== null &&
      typeof value === 'object' &&
      !Array.isArray(value) &&
      typeof result[key] === 'object' &&
      result[key] !== null &&
      !Array.isArray(result[key])
    ) {
      result[key] = deepMerge(result[key] as Record<string, unknown>, value as Record<string, unknown>);
    } else {
      result[key] = value;
    }
  }
  return result;
}

/** Compute list of changed dot-paths between two configs */
function getChangedPaths(
  previous: Record<string, unknown>,
  current: Record<string, unknown>,
  prefix = '',
): string[] {
  const paths: string[] = [];
  const allKeys = new Set([...Object.keys(previous), ...Object.keys(current)]);

  for (const key of allKeys) {
    const path = prefix ? `${prefix}.${key}` : key;
    const prevVal = previous[key];
    const currVal = current[key];

    if (prevVal === currVal) continue;

    if (
      prevVal !== null &&
      currVal !== null &&
      typeof prevVal === 'object' &&
      typeof currVal === 'object' &&
      !Array.isArray(prevVal) &&
      !Array.isArray(currVal)
    ) {
      paths.push(
        ...getChangedPaths(
          prevVal as Record<string, unknown>,
          currVal as Record<string, unknown>,
          path,
        ),
      );
    } else if (JSON.stringify(prevVal) !== JSON.stringify(currVal)) {
      paths.push(path);
    }
  }

  return paths;
}
