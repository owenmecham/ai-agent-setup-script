import WebSocket from 'ws';
import pino from 'pino';

const logger = pino({ name: 'bop-agent' });

export interface BopAgentConfig {
  wsUrl: string;
  apiKey: string;
  profileId: string;
  serviceIds: string[];
}

type TaskHandler = (task: {
  id: string;
  serviceId: string;
  input: Record<string, unknown>;
}) => Promise<Record<string, unknown>>;

export class BopAgent {
  private ws: WebSocket | null = null;
  private config: BopAgentConfig;
  private taskHandler?: TaskHandler;
  private reconnectTimer?: ReturnType<typeof setTimeout>;
  private heartbeatTimer?: ReturnType<typeof setInterval>;

  constructor(config: BopAgentConfig) {
    this.config = config;
  }

  onTask(handler: TaskHandler): void {
    this.taskHandler = handler;
  }

  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(this.config.wsUrl, {
        headers: {
          'X-API-Key': this.config.apiKey,
          'X-Profile-ID': this.config.profileId,
        },
      });

      this.ws.on('open', () => {
        logger.info('Connected to BOP hive mind');
        this.startHeartbeat();

        // Register available services
        this.send({
          type: 'register',
          services: this.config.serviceIds,
        });

        resolve();
      });

      this.ws.on('message', (data) => {
        try {
          const msg = JSON.parse(data.toString());
          this.handleMessage(msg);
        } catch (err) {
          logger.error({ err }, 'Failed to parse BOP message');
        }
      });

      this.ws.on('close', () => {
        logger.warn('BOP connection closed, reconnecting...');
        this.stopHeartbeat();
        this.scheduleReconnect();
      });

      this.ws.on('error', (err) => {
        logger.error({ err }, 'BOP WebSocket error');
        reject(err);
      });
    });
  }

  async disconnect(): Promise<void> {
    this.stopHeartbeat();
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  private send(data: unknown): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data));
    }
  }

  private async handleMessage(msg: { type: string; [key: string]: unknown }): Promise<void> {
    switch (msg.type) {
      case 'task': {
        if (!this.taskHandler) {
          this.send({ type: 'task-result', taskId: msg.taskId, error: 'No handler registered' });
          return;
        }

        try {
          const result = await this.taskHandler({
            id: msg.taskId as string,
            serviceId: msg.serviceId as string,
            input: (msg.input ?? {}) as Record<string, unknown>,
          });
          this.send({ type: 'task-result', taskId: msg.taskId, result });
        } catch (err) {
          this.send({
            type: 'task-result',
            taskId: msg.taskId,
            error: err instanceof Error ? err.message : String(err),
          });
        }
        break;
      }

      case 'pong':
        break;

      default:
        logger.debug({ type: msg.type }, 'Unknown BOP message type');
    }
  }

  private startHeartbeat(): void {
    this.heartbeatTimer = setInterval(() => {
      this.send({ type: 'ping' });
    }, 30_000);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
  }

  private scheduleReconnect(): void {
    this.reconnectTimer = setTimeout(() => {
      this.connect().catch((err) => {
        logger.error({ err }, 'BOP reconnection failed');
        this.scheduleReconnect();
      });
    }, 5000);
  }
}
