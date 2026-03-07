import type { ApprovalLevel as _ApprovalLevel, MurphConfig as _MurphConfig } from '@murph/config';

export type ApprovalLevel = _ApprovalLevel;
export type MurphConfig = _MurphConfig;

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

export interface UserProfile {
  name?: string;
  location?: string;
  profession?: string;
  hobbies?: string[];
  social_twitter?: string;
  social_linkedin?: string;
  social_github?: string;
  social_instagram?: string;
  social_facebook?: string;
  bio?: string;
}

export interface AgentContext {
  conversationId: string;
  recentMessages: MurphMessage[];
  semanticMemories: SemanticMemory[];
  knowledgeChunks: KnowledgeChunk[];
  entities: Entity[];
  availableTools: ToolDescription[];
  userProfile?: UserProfile;
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
