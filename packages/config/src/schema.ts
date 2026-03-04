import { z } from 'zod';

export const ApprovalLevelSchema = z.enum(['auto', 'notify', 'require']);

export const MurphConfigSchema = z.object({
  agent: z.object({
    name: z.string().default('Murph'),
    model: z.string().default('sonnet'),
    max_budget_per_message_usd: z.number().default(0.50),
    timezone: z.string().default('America/Denver'),
    api_port: z.number().default(3140),
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
