import { randomUUID } from 'node:crypto';
import type { MurphMessage, MurphConfig, Action, ChannelAdapter, UserProfile, AgentStep, HandleMessageResult } from './types.js';
import { ClaudeBridge } from './claude-bridge.js';
import { ActionRegistry } from './action-registry.js';
import { ApprovalGate } from './approval-gate.js';
import { AuditLogger } from './audit-logger.js';
import { AgentAPI } from './agent-api.js';
import { createLogger } from './logger.js';
import { getUserProfile } from './profile-db.js';
import type { ConfigManager, ConfigChangeEvent } from '@murph/config';

const logger = createLogger('agent');

const ACK_POOL = [
  'Got it, working on this...',
  'On it!',
  'Let me think about that...',
  'Processing your request...',
  'Working on it...',
  'Give me a moment...',
];

export interface MemoryInterface {
  getContext(conversationId: string, maxTokens: number): Promise<{
    recentMessages: MurphMessage[];
    semanticMemories: Array<{ id: string; summary: string; importance: number; createdAt: Date }>;
    knowledgeChunks: Array<{ id: string; documentTitle: string; content: string; source: string; similarity: number }>;
    entities: Array<{ id: string; name: string; type: string; attributes: Record<string, unknown> }>;
  }>;
  store(message: MurphMessage, response: string, actions: Action[], results: unknown[]): Promise<void>;
}

export class Agent {
  private bridge: ClaudeBridge;
  private registry: ActionRegistry;
  private approvalGate: ApprovalGate;
  private auditLogger: AuditLogger;
  private memory: MemoryInterface | null = null;
  private channels: ChannelAdapter[] = [];
  private config: MurphConfig;
  private configManager: ConfigManager | null = null;
  private agentAPI: AgentAPI | null = null;

  constructor(config: MurphConfig, configManager?: ConfigManager) {
    this.config = config;
    this.configManager = configManager ?? null;
    this.bridge = new ClaudeBridge(config.agent.model);
    this.registry = new ActionRegistry();
    this.approvalGate = new ApprovalGate(config);
    this.auditLogger = new AuditLogger();

    if (this.configManager) {
      this.configManager.on('config:changed', (event: ConfigChangeEvent) => {
        this.handleConfigChange(event);
      });
    }
  }

  private handleConfigChange(event: ConfigChangeEvent): void {
    const { current, changedPaths } = event;
    logger.info({ changedPaths }, 'Config changed, applying hot reload');

    this.config = current;

    for (const path of changedPaths) {
      if (path === 'agent.model') {
        this.bridge.setModel(current.agent.model);
        logger.info({ model: current.agent.model }, 'Model updated');
      }

      if (path.startsWith('security.approval_defaults')) {
        this.approvalGate.updateDefaults(current.security.approval_defaults);
        logger.info('Approval defaults updated');
      }

      if (path === 'logging.level') {
        import('./logger.js').then(({ setLogLevel }) => {
          setLogLevel(current.logging.level);
          logger.info({ level: current.logging.level }, 'Log level updated');
        }).catch(() => {
          // setLogLevel might not be available
        });
      }
    }
  }

  getConfig(): MurphConfig {
    return this.config;
  }

  getConfigManager(): ConfigManager | null {
    return this.configManager;
  }

  getChannels(): ChannelAdapter[] {
    return this.channels;
  }

  getRegistry(): ActionRegistry {
    return this.registry;
  }

  getApprovalGate(): ApprovalGate {
    return this.approvalGate;
  }

  getAuditLogger(): AuditLogger {
    return this.auditLogger;
  }

  setMemory(memory: MemoryInterface): void {
    this.memory = memory;
  }

  addChannel(channel: ChannelAdapter): void {
    this.channels.push(channel);
    channel.onMessage(async (message) => { await this.handleMessage(message, channel); });
  }

  async handleMessage(message: MurphMessage, channel?: ChannelAdapter, options?: { model?: string }): Promise<HandleMessageResult> {
    const MAX_ITERATIONS = 5;

    logger.info(
      { conversationId: message.conversationId, channel: message.channel, model: options?.model },
      'Handling message',
    );

    // Send immediate acknowledgment (unless excluded or disabled)
    const ackConfig = this.config.acknowledgment;
    if (
      ackConfig.enabled &&
      ackConfig.style !== 'none' &&
      channel &&
      !ackConfig.excluded_channels.includes(channel.name)
    ) {
      const ackMsg = ackConfig.style === 'static'
        ? ackConfig.static_message
        : ACK_POOL[Math.floor(Math.random() * ACK_POOL.length)];
      try {
        await channel.sendReply(message.conversationId, ackMsg);
      } catch (err) {
        logger.warn({ err }, 'Failed to send acknowledgment');
      }
    }

    // Temporarily override bridge model if requested
    const originalModel = options?.model ? this.bridge.getModel() : undefined;
    if (options?.model) {
      this.bridge.setModel(options.model);
    }

    try {
      // 1. Get context from memory
      const context = this.memory
        ? await this.memory.getContext(
            message.conversationId,
            this.config.memory.max_context_tokens,
          )
        : {
            recentMessages: [],
            semanticMemories: [],
            knowledgeChunks: [],
            entities: [],
          };

      // 2. Get available tools
      const availableTools = this.registry.getToolDescriptions();

      // 2b. Fetch user profile
      let userProfile: UserProfile | undefined;
      try {
        const profile = await getUserProfile(this.config.database.url);
        if (profile) userProfile = profile;
      } catch {
        // Profile fetch is non-critical
      }

      const agentContext = {
        conversationId: message.conversationId,
        recentMessages: context.recentMessages,
        semanticMemories: context.semanticMemories,
        knowledgeChunks: context.knowledgeChunks,
        entities: context.entities,
        availableTools,
        userProfile,
      };

      // 3. Initial call to Claude
      let claudeResponse;
      const allSteps: AgentStep[] = [];
      const allResults: unknown[] = [];

      try {
        claudeResponse = await this.bridge.reason(agentContext, message.content);
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        logger.error({ err, conversationId: message.conversationId }, 'Claude bridge error during initial reasoning');
        const userReply = 'Sorry, I ran into an error processing your request.';
        if (channel) {
          await channel.sendReply(message.conversationId, userReply);
        }
        return { response: userReply, steps: [] };
      }

      // 4. Agentic loop — execute actions, feed results back
      for (let iteration = 0; iteration < MAX_ITERATIONS && claudeResponse.actions.length > 0; iteration++) {
        logger.info({ iteration, actionCount: claudeResponse.actions.length }, 'Agentic loop iteration');

        const iterationSteps: AgentStep[] = [];

        for (const actionDef of claudeResponse.actions) {
          const action: Action = {
            id: randomUUID(),
            name: actionDef.name,
            description: '',
            parameters: actionDef.parameters,
            approval: 'require',
          };

          // Check approval
          const { approved } = await this.approvalGate.check(action);

          await this.auditLogger.log({
            action: action.name,
            status: approved ? 'started' : 'denied',
            channel: message.channel,
            conversationId: message.conversationId,
            userId: message.sender,
            parameters: action.parameters,
          });

          if (!approved) {
            const step: AgentStep = {
              action: action.name,
              parameters: action.parameters,
              success: false,
              error: 'Action denied by approval gate',
            };
            iterationSteps.push(step);
            allResults.push({ actionId: action.id, denied: true });
            continue;
          }

          // Execute
          const result = await this.registry.execute(action);
          allResults.push(result);

          const step: AgentStep = {
            action: action.name,
            parameters: action.parameters,
            success: result.success,
            data: result.data,
            error: result.error,
          };
          iterationSteps.push(step);

          await this.auditLogger.log({
            action: action.name,
            status: result.success ? 'completed' : 'failed',
            channel: message.channel,
            conversationId: message.conversationId,
            userId: message.sender,
            parameters: action.parameters,
            result: result.data,
            error: result.error,
          });
        }

        allSteps.push(...iterationSteps);

        // Feed results back to Claude for follow-up reasoning
        try {
          claudeResponse = await this.bridge.reasonWithResults(
            agentContext,
            message.content,
            claudeResponse.response,
            iterationSteps,
          );
        } catch (err) {
          logger.error({ err, conversationId: message.conversationId }, 'Claude bridge error during follow-up reasoning');
          const userReply = 'Sorry, I ran into an error processing follow-up results.';
          if (channel) {
            await channel.sendReply(message.conversationId, userReply);
          }
          return { response: userReply, steps: allSteps };
        }
      }

      // 5. Store in memory
      if (this.memory) {
        await this.memory.store(
          message,
          claudeResponse.response,
          claudeResponse.actions.map((a) => ({
            id: randomUUID(),
            name: a.name,
            description: '',
            parameters: a.parameters,
            approval: 'auto' as const,
          })),
          allResults,
        );
      }

      // 6. Reply via channel
      if (channel) {
        await channel.sendReply(message.conversationId, claudeResponse.response);
      }

      return { response: claudeResponse.response, steps: allSteps };
    } finally {
      // Restore original model after per-request override
      if (originalModel !== undefined) {
        this.bridge.setModel(originalModel);
      }
    }
  }

  async start(): Promise<void> {
    logger.info({ name: this.config.agent.name }, 'Starting agent');

    // Start Agent HTTP API
    const apiPort = (this.config.agent as any).api_port ?? 3140;
    this.agentAPI = new AgentAPI(this, this.configManager, apiPort);
    await this.agentAPI.start();

    // Start file watcher if ConfigManager is available
    if (this.configManager) {
      await this.configManager.watch();
    }

    for (const channel of this.channels) {
      await channel.start();
      logger.info({ channel: channel.name }, 'Channel started');
    }
  }

  async stop(): Promise<void> {
    logger.info('Stopping agent');

    if (this.agentAPI) {
      await this.agentAPI.stop();
    }

    if (this.configManager) {
      await this.configManager.unwatch();
    }

    for (const channel of this.channels) {
      await channel.stop();
    }
    await this.auditLogger.flush();
  }
}
