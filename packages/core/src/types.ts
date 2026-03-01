export interface MurphMessage {
  id: string;
  conversationId: string;
  channel: 'imessage' | 'telegram' | 'dashboard' | 'scheduler' | 'system';
  sender: string;
  content: string;
  timestamp: Date;
  metadata?: Record<string, unknown>;
}

export interface MurphResponse {
  content: string;
  actions: Action[];
}

export interface Action {
  id: string;
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  approval: ApprovalLevel;
}

export type ApprovalLevel = 'auto' | 'notify' | 'require';

export interface ActionResult {
  actionId: string;
  success: boolean;
  data?: unknown;
  error?: string;
}

export interface ActionHandler {
  name: string;
  description: string;
  parameterSchema?: Record<string, unknown>;
  execute: (params: Record<string, unknown>) => Promise<ActionResult>;
}

export interface AgentContext {
  conversationId: string;
  recentMessages: MurphMessage[];
  semanticMemories: SemanticMemory[];
  knowledgeChunks: KnowledgeChunk[];
  entities: Entity[];
  availableTools: ToolDescription[];
}

export interface SemanticMemory {
  id: string;
  summary: string;
  importance: number;
  createdAt: Date;
}

export interface KnowledgeChunk {
  id: string;
  documentTitle: string;
  content: string;
  source: string;
  similarity: number;
}

export interface Entity {
  id: string;
  name: string;
  type: string;
  attributes: Record<string, unknown>;
}

export interface ToolDescription {
  name: string;
  description: string;
}

export interface ClaudeBridgeResponse {
  response: string;
  actions: Array<{
    name: string;
    parameters: Record<string, unknown>;
  }>;
}

export interface ChannelAdapter {
  name: string;
  start(): Promise<void>;
  stop(): Promise<void>;
  onMessage(handler: (message: MurphMessage) => Promise<void>): void;
  sendReply(conversationId: string, content: string): Promise<void>;
}

export interface AuditEntry {
  id: string;
  timestamp: Date;
  action: string;
  status: 'started' | 'completed' | 'failed' | 'approved' | 'denied';
  channel: string;
  conversationId: string;
  userId: string;
  parameters?: Record<string, unknown>;
  result?: unknown;
  error?: string;
}

export interface MurphConfig {
  agent: {
    name: string;
    model: string;
    max_budget_per_message_usd: number;
    timezone: string;
  };
  database: {
    url: string;
  };
  embedding: {
    provider: string;
    model: string;
    ollama_url: string;
  };
  security: {
    dashboard_port: number;
    approval_defaults: Record<string, ApprovalLevel>;
  };
  channels: {
    imessage: {
      enabled: boolean;
      bluebubbles_url: string;
      bluebubbles_password: string;
      webhook_port: number;
    };
    telegram: {
      enabled: boolean;
      bot_token: string;
      allowed_user_ids: number[];
    };
  };
  knowledge: {
    sources: {
      obsidian: {
        enabled: boolean;
        vault_path: string;
        watch: boolean;
      };
      granola: {
        enabled: boolean;
      };
      plaud: {
        enabled: boolean;
      };
    };
  };
  mcp_servers: Array<{
    name: string;
    transport: 'stdio' | 'http';
    url?: string;
    command?: string;
    args?: string[];
    headers?: Record<string, string>;
  }>;
  integrations: Record<string, { enabled: boolean } & Record<string, unknown>>;
  creator: {
    enabled: boolean;
    deploy_target: string;
    project_prefix: string;
  };
  scheduler: {
    enabled: boolean;
  };
  memory: {
    short_term_buffer_size: number;
    flush_interval_seconds: number;
    semantic_search_limit: number;
    knowledge_search_limit: number;
    max_context_tokens: number;
  };
  logging: {
    level: string;
    file: string;
  };
}
