import { createServer, type Server, type Socket } from 'node:net';
import { mkdirSync, existsSync, unlinkSync } from 'node:fs';
import { dirname } from 'node:path';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { createLogger } from './logger.js';
import type { Agent } from './agent.js';
import { loadConfig, writeConfig } from './config.js';

const logger = createLogger('ipc-server');

export interface IPCRequest {
  id: string;
  method: string;
  params?: Record<string, unknown>;
}

export interface IPCResponse {
  id: string;
  result?: unknown;
  error?: string;
}

export interface IPCEvent {
  event: string;
  data: unknown;
}

const DEFAULT_SOCKET_PATH = join(homedir(), '.murph', 'agent.sock');

export class IPCServer {
  private server: Server | null = null;
  private clients = new Set<Socket>();
  private agent: Agent;
  private socketPath: string;
  private startTime = Date.now();

  constructor(agent: Agent, socketPath?: string) {
    this.agent = agent;
    this.socketPath = socketPath ?? DEFAULT_SOCKET_PATH;
  }

  async start(): Promise<void> {
    const dir = dirname(this.socketPath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }

    // Clean up stale socket
    if (existsSync(this.socketPath)) {
      unlinkSync(this.socketPath);
    }

    this.server = createServer((socket) => {
      this.clients.add(socket);
      logger.info('IPC client connected');

      let buffer = '';

      socket.on('data', (data) => {
        buffer += data.toString();
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const request = JSON.parse(line) as IPCRequest;
            this.handleRequest(request, socket).catch((err) => {
              logger.error({ err, method: request.method }, 'IPC request handler error');
            });
          } catch {
            logger.warn('Invalid IPC message received');
          }
        }
      });

      socket.on('close', () => {
        this.clients.delete(socket);
        logger.info('IPC client disconnected');
      });

      socket.on('error', (err) => {
        this.clients.delete(socket);
        logger.error({ err }, 'IPC client error');
      });
    });

    return new Promise((resolve, reject) => {
      this.server!.listen(this.socketPath, () => {
        logger.info({ socketPath: this.socketPath }, 'IPC server started');
        resolve();
      });
      this.server!.on('error', reject);
    });
  }

  async stop(): Promise<void> {
    for (const client of this.clients) {
      client.destroy();
    }
    this.clients.clear();

    return new Promise((resolve) => {
      if (!this.server) {
        resolve();
        return;
      }
      this.server.close(() => {
        if (existsSync(this.socketPath)) {
          try { unlinkSync(this.socketPath); } catch { /* ignore */ }
        }
        logger.info('IPC server stopped');
        resolve();
      });
    });
  }

  broadcast(event: string, data: unknown): void {
    const msg = JSON.stringify({ event, data } as IPCEvent) + '\n';
    for (const client of this.clients) {
      try {
        client.write(msg);
      } catch {
        this.clients.delete(client);
      }
    }
  }

  private async handleRequest(request: IPCRequest, socket: Socket): Promise<void> {
    const { id, method, params } = request;

    try {
      const result = await this.dispatch(method, params ?? {});
      this.sendResponse(socket, { id, result });
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      this.sendResponse(socket, { id, error });
    }
  }

  private sendResponse(socket: Socket, response: IPCResponse): void {
    try {
      socket.write(JSON.stringify(response) + '\n');
    } catch {
      // Client disconnected
    }
  }

  private async dispatch(method: string, params: Record<string, unknown>): Promise<unknown> {
    switch (method) {
      case 'status':
        return {
          name: this.agent.getConfig().agent.name,
          uptime: Date.now() - this.startTime,
          channels: this.agent.getChannels().map((c) => c.name),
        };

      case 'approvals.list':
        return this.agent.getApprovalGate().getPending().map((a) => ({
          id: a.id,
          action: a.action.name,
          parameters: a.action.parameters,
          requestedAt: a.requestedAt.toISOString(),
        }));

      case 'approvals.resolve': {
        const { requestId, approved, resolvedBy } = params as {
          requestId: string;
          approved: boolean;
          resolvedBy?: string;
        };
        this.agent.getApprovalGate().resolve(requestId, approved, resolvedBy);
        return { ok: true };
      }

      case 'audit.query': {
        const auditLogger = this.agent.getAuditLogger();
        return auditLogger.query({
          limit: params.limit as number | undefined,
          offset: params.offset as number | undefined,
          action: params.action as string | undefined,
          status: params.status as string | undefined,
          channel: params.channel as string | undefined,
          since: params.since ? new Date(params.since as string) : undefined,
        });
      }

      case 'config.get': {
        const configManager = this.agent.getConfigManager();
        if (configManager) {
          return configManager.get();
        }
        return loadConfig();
      }

      case 'config.update': {
        const updates = params.updates as Record<string, unknown>;
        const configManager = this.agent.getConfigManager();
        if (configManager) {
          return configManager.update(updates as any);
        }
        return writeConfig(updates);
      }

      case 'chat.send': {
        const { message, conversationId, model } = params as {
          message: string;
          conversationId?: string;
          model?: string;
        };
        const result = await this.agent.handleMessage(
          {
            id: crypto.randomUUID(),
            conversationId: conversationId ?? crypto.randomUUID(),
            channel: 'dashboard',
            sender: 'dashboard-user',
            content: message,
            timestamp: new Date(),
          },
          undefined,
          model ? { model } : undefined,
        );
        return { response: result.response, steps: result.steps };
      }

      default:
        throw new Error(`Unknown IPC method: ${method}`);
    }
  }

  setupEventForwarding(): void {
    const gate = this.agent.getApprovalGate();

    gate.on('approval-required', (request) => {
      this.broadcast('approval-required', {
        id: request.id,
        action: request.action.name,
        parameters: request.action.parameters,
        requestedAt: request.requestedAt.toISOString(),
      });
    });

    gate.on('notify', (action) => {
      this.broadcast('action-notify', {
        action: action.name,
        parameters: action.parameters,
      });
    });
  }
}
