import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { parse as parseYaml } from 'yaml';
import { z } from 'zod';
import type { MurphConfig } from './types.js';

const ApprovalLevelSchema = z.enum(['auto', 'notify', 'require']);

const MurphConfigSchema = z.object({
  agent: z.object({
    name: z.string().default('Murph'),
    model: z.string().default('sonnet'),
    max_budget_per_message_usd: z.number().default(0.50),
    timezone: z.string().default('America/Denver'),
  }),
  database: z.object({
    url: z.string().default('postgresql://localhost:5432/murph'),
  }),
  embedding: z.object({
    provider: z.string().default('ollama'),
    model: z.string().default('nomic-embed-text'),
    ollama_url: z.string().default('http://localhost:11434'),
  }),
  security: z.object({
    dashboard_port: z.number().default(3141),
    approval_defaults: z.record(ApprovalLevelSchema).default({
      'gmail.send': 'require',
      'gmail.read': 'auto',
      'imessage.send': 'require',
      'telegram.send': 'notify',
      'bop.*': 'require',
      'mcp.*': 'require',
      'playwright.*': 'notify',
      'cloudflare.deploy': 'require',
      'creator.*': 'require',
      'scheduler.create': 'notify',
      'hubspot.*': 'notify',
      'gohighlevel.*': 'notify',
      'knowledge.ingest': 'auto',
      'knowledge.delete': 'require',
    }),
  }),
  channels: z.object({
    imessage: z.object({
      enabled: z.boolean().default(false),
      bluebubbles_url: z.string().default('http://localhost:1234'),
      bluebubbles_password: z.string().default(''),
      webhook_port: z.number().default(3142),
    }).default({}),
    telegram: z.object({
      enabled: z.boolean().default(false),
      bot_token: z.string().default(''),
      allowed_user_ids: z.array(z.number()).default([]),
    }).default({}),
  }).default({}),
  knowledge: z.object({
    sources: z.object({
      obsidian: z.object({
        enabled: z.boolean().default(false),
        vault_path: z.string().default(''),
        watch: z.boolean().default(true),
      }).default({}),
      granola: z.object({
        enabled: z.boolean().default(false),
      }).default({}),
      plaud: z.object({
        enabled: z.boolean().default(false),
      }).default({}),
    }).default({}),
  }).default({}),
  mcp_servers: z.array(z.object({
    name: z.string(),
    transport: z.enum(['stdio', 'http']),
    url: z.string().optional(),
    command: z.string().optional(),
    args: z.array(z.string()).optional(),
    headers: z.record(z.string()).optional(),
  })).default([]),
  integrations: z.record(z.object({
    enabled: z.boolean(),
  }).passthrough()).default({}),
  creator: z.object({
    enabled: z.boolean().default(false),
    deploy_target: z.string().default('cloudflare'),
    project_prefix: z.string().default('murph-gen'),
  }).default({}),
  scheduler: z.object({
    enabled: z.boolean().default(false),
  }).default({}),
  memory: z.object({
    short_term_buffer_size: z.number().default(50),
    flush_interval_seconds: z.number().default(30),
    semantic_search_limit: z.number().default(5),
    knowledge_search_limit: z.number().default(5),
    max_context_tokens: z.number().default(4000),
  }).default({}),
  logging: z.object({
    level: z.string().default('info'),
    file: z.string().default('~/.murph/murph.log'),
  }).default({}),
});

let cachedConfig: MurphConfig | null = null;

export function loadConfig(configPath?: string): MurphConfig {
  if (cachedConfig) return cachedConfig;

  const path = configPath ?? resolve(process.cwd(), 'murph.config.yaml');

  if (!existsSync(path)) {
    throw new Error(`Config file not found: ${path}`);
  }

  const raw = readFileSync(path, 'utf-8');
  const parsed = parseYaml(raw);

  // Resolve secret references like ${SECRET_NAME}
  const resolved = resolveSecrets(parsed);

  cachedConfig = MurphConfigSchema.parse(resolved) as MurphConfig;
  return cachedConfig;
}

export function resetConfigCache(): void {
  cachedConfig = null;
}

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
