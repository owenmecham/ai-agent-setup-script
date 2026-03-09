import { Bot } from 'grammy';
import { adaptTelegramMessage, type MurphMessage } from './adapter.js';
import pino from 'pino';

const logger = pino({ name: 'channel-telegram' });

export interface TelegramChannelConfig {
  botToken: string;
  allowedUserIds: number[];
}

type MessageHandler = (message: MurphMessage) => Promise<void>;

export class TelegramChannel {
  readonly name = 'telegram';
  private bot: Bot;
  private allowedUserIds: Set<number>;
  private messageHandler?: MessageHandler;

  constructor(config: TelegramChannelConfig) {
    this.bot = new Bot(config.botToken);
    this.allowedUserIds = new Set(config.allowedUserIds);
  }

  onMessage(handler: MessageHandler): void {
    this.messageHandler = handler;
  }

  async start(): Promise<void> {
    this.bot.on('message:text', async (ctx) => {
      const userId = ctx.from?.id;

      // Check allowlist
      if (userId && !this.allowedUserIds.has(userId)) {
        logger.warn({ userId }, 'Unauthorized user attempted to message bot');
        await ctx.reply('Unauthorized. This bot is private.');
        return;
      }

      if (!this.messageHandler) return;

      const message = adaptTelegramMessage({
        message_id: ctx.message.message_id,
        chat: ctx.chat,
        from: ctx.from,
        text: ctx.message.text,
        date: ctx.message.date,
      });

      logger.info({ sender: message.sender, conversationId: message.conversationId }, 'Received message');

      try {
        await this.messageHandler(message);
      } catch (err) {
        logger.error({ err }, 'Error handling message');
        await ctx.reply('Sorry, I encountered an error processing your message.');
      }
    });

    await this.bot.start();
    logger.info('Telegram bot started');
  }

  async stop(): Promise<void> {
    this.bot.stop();
    logger.info('Telegram bot stopped');
  }

  async sendReply(conversationId: string, content: string): Promise<void> {
    // Extract chat ID from conversation ID
    const chatId = conversationId.replace('telegram-', '');
    try {
      await this.bot.api.sendMessage(Number(chatId), content);
    } catch (err) {
      logger.error({ err, conversationId }, 'Failed to send reply');
      throw err;
    }
  }
}
