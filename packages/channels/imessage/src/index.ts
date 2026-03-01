import { BlueBubblesClient, type BlueBubblesConfig } from './bluebubbles-client.js';
import { WebhookServer } from './webhook-server.js';
import { type MurphMessage } from './adapter.js';
import pino from 'pino';

const logger = pino({ name: 'channel-imessage' });

export interface IMessageChannelConfig {
  blueBubblesUrl: string;
  blueBubblesPassword: string;
  webhookPort: number;
}

type MessageHandler = (message: MurphMessage) => Promise<void>;

export class IMessageChannel {
  readonly name = 'imessage';
  private client: BlueBubblesClient;
  private webhook: WebhookServer;
  private messageHandler?: MessageHandler;

  constructor(config: IMessageChannelConfig) {
    this.client = new BlueBubblesClient({
      url: config.blueBubblesUrl,
      password: config.blueBubblesPassword,
    });
    this.webhook = new WebhookServer(config.webhookPort);
  }

  onMessage(handler: MessageHandler): void {
    this.messageHandler = handler;
    this.webhook.onMessage(handler);
  }

  async start(): Promise<void> {
    await this.webhook.start();
    logger.info('iMessage channel started');
  }

  async stop(): Promise<void> {
    await this.webhook.stop();
    logger.info('iMessage channel stopped');
  }

  async sendReply(conversationId: string, content: string): Promise<void> {
    const chatGuid = conversationId.replace('imessage-', '');
    await this.client.sendMessage(chatGuid, content);
  }
}

export { BlueBubblesClient } from './bluebubbles-client.js';
export type { BlueBubblesConfig } from './bluebubbles-client.js';
export { WebhookServer } from './webhook-server.js';
export { adaptBlueBubblesMessage } from './adapter.js';
export type { MurphMessage } from './adapter.js';
