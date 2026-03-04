import { createConnection, type Socket } from 'node:net';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { EventEmitter } from 'node:events';
import type { IPCRequest, IPCResponse, IPCEvent } from './ipc-server.js';

const DEFAULT_SOCKET_PATH = join(homedir(), '.murph', 'agent.sock');

export class IPCClient extends EventEmitter {
  private socket: Socket | null = null;
  private socketPath: string;
  private pending = new Map<string, { resolve: (value: unknown) => void; reject: (err: Error) => void }>();
  private buffer = '';
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private _connected = false;

  constructor(socketPath?: string) {
    super();
    this.socketPath = socketPath ?? DEFAULT_SOCKET_PATH;
  }

  get connected(): boolean {
    return this._connected;
  }

  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.socket = createConnection(this.socketPath, () => {
        this._connected = true;
        this.emit('connected');
        resolve();
      });

      this.socket.on('data', (data) => {
        this.buffer += data.toString();
        const lines = this.buffer.split('\n');
        this.buffer = lines.pop() ?? '';

        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const msg = JSON.parse(line);

            // Check if it's a response (has 'id') or an event (has 'event')
            if ('id' in msg) {
              const response = msg as IPCResponse;
              const pending = this.pending.get(response.id);
              if (pending) {
                this.pending.delete(response.id);
                if (response.error) {
                  pending.reject(new Error(response.error));
                } else {
                  pending.resolve(response.result);
                }
              }
            } else if ('event' in msg) {
              const event = msg as IPCEvent;
              this.emit(event.event, event.data);
            }
          } catch {
            // Ignore malformed messages
          }
        }
      });

      this.socket.on('close', () => {
        this._connected = false;
        this.emit('disconnected');
        // Reject all pending requests
        for (const [, pending] of this.pending) {
          pending.reject(new Error('Connection closed'));
        }
        this.pending.clear();
      });

      this.socket.on('error', (err) => {
        this._connected = false;
        if (!this.socket) {
          reject(err);
        }
        this.emit('error', err);
      });
    });
  }

  async connectWithRetry(maxAttempts = 10, intervalMs = 1000): Promise<void> {
    for (let i = 0; i < maxAttempts; i++) {
      try {
        await this.connect();
        return;
      } catch {
        if (i < maxAttempts - 1) {
          await new Promise((r) => setTimeout(r, intervalMs));
        }
      }
    }
    throw new Error(`Failed to connect to agent after ${maxAttempts} attempts`);
  }

  disconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.socket) {
      this.socket.destroy();
      this.socket = null;
    }
    this._connected = false;
  }

  async call(method: string, params?: Record<string, unknown>): Promise<unknown> {
    if (!this.socket || !this._connected) {
      throw new Error('Not connected to agent');
    }

    const id = crypto.randomUUID();
    const request: IPCRequest = { id, method, params };

    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });

      const timeout = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`IPC call timed out: ${method}`));
      }, 30_000);

      this.pending.set(id, {
        resolve: (value) => {
          clearTimeout(timeout);
          resolve(value);
        },
        reject: (err) => {
          clearTimeout(timeout);
          reject(err);
        },
      });

      this.socket!.write(JSON.stringify(request) + '\n');
    });
  }

  // Typed convenience methods
  async getStatus(): Promise<{ name: string; uptime: number; channels: string[] }> {
    return this.call('status') as Promise<{ name: string; uptime: number; channels: string[] }>;
  }

  async listApprovals(): Promise<Array<{ id: string; action: string; parameters: Record<string, unknown>; requestedAt: string }>> {
    return this.call('approvals.list') as Promise<Array<{ id: string; action: string; parameters: Record<string, unknown>; requestedAt: string }>>;
  }

  async resolveApproval(requestId: string, approved: boolean, resolvedBy?: string): Promise<void> {
    await this.call('approvals.resolve', { requestId, approved, resolvedBy });
  }

  async queryAudit(opts?: { limit?: number; offset?: number; action?: string; status?: string; channel?: string; since?: string }): Promise<unknown[]> {
    return this.call('audit.query', opts ?? {}) as Promise<unknown[]>;
  }

  async getConfig(): Promise<unknown> {
    return this.call('config.get');
  }

  async updateConfig(updates: Record<string, unknown>): Promise<unknown> {
    return this.call('config.update', { updates });
  }

  async sendChat(message: string, conversationId?: string): Promise<{ response: string }> {
    return this.call('chat.send', { message, conversationId }) as Promise<{ response: string }>;
  }
}
