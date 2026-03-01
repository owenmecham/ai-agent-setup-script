import Fastify from 'fastify';
import { adaptBlueBubblesMessage, type MurphMessage } from './adapter.js';
import pino from 'pino';

const logger = pino({ name: 'imessage-webhook' });

type MessageHandler = (message: MurphMessage) => Promise<void>;

export class WebhookServer {
  private app = Fastify({ logger: false });
  private port: number;
  private messageHandler?: MessageHandler;

  constructor(port: number = 3142) {
    this.port = port;
    this.setupRoutes();
  }

  onMessage(handler: MessageHandler): void {
    this.messageHandler = handler;
  }

  private setupRoutes(): void {
    this.app.post('/webhook', async (request, reply) => {
      const body = request.body as {
        type: string;
        data: {
          guid: string;
          chatGuid: string;
          handle?: { address: string };
          text: string;
          dateCreated: number;
          isFromMe: boolean;
          attachments?: unknown[];
        };
      };

      const message = adaptBlueBubblesMessage(body);
      if (!message) {
        return reply.status(200).send({ status: 'ignored' });
      }

      logger.info({ sender: message.sender }, 'Received iMessage webhook');

      if (this.messageHandler) {
        try {
          await this.messageHandler(message);
        } catch (err) {
          logger.error({ err }, 'Error handling iMessage');
        }
      }

      return reply.status(200).send({ status: 'ok' });
    });

    this.app.get('/health', async (_request, reply) => {
      return reply.status(200).send({ status: 'healthy' });
    });
  }

  async start(): Promise<void> {
    await this.app.listen({ port: this.port, host: '127.0.0.1' });
    logger.info({ port: this.port }, 'iMessage webhook server started');
  }

  async stop(): Promise<void> {
    await this.app.close();
    logger.info('iMessage webhook server stopped');
  }
}
