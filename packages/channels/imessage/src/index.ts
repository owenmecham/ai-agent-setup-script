import { ChatDb } from './chat-db.js';
import { adaptChatDbRow, type MurphMessage } from './adapter.js';
import * as applescriptSender from './applescript-sender.js';
import pino from 'pino';

const logger = pino({ name: 'channel-imessage' });

export interface IMessageChannelConfig {
  chatDbPath: string;
  pollIntervalMs: number;
}

type MessageHandler = (message: MurphMessage) => Promise<void>;

export class IMessageChannel {
  readonly name = 'imessage';
  private chatDb: ChatDb;
  private config: IMessageChannelConfig;
  private lastRowId = 0;
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private messageHandler?: MessageHandler;

  constructor(config: IMessageChannelConfig) {
    this.config = config;
    this.chatDb = new ChatDb();
  }

  onMessage(handler: MessageHandler): void {
    this.messageHandler = handler;
  }

  async start(): Promise<void> {
    try {
      this.chatDb.open(this.config.chatDbPath);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('unable to open') || msg.includes('EPERM') || msg.includes('EACCES') || msg.includes('not permitted')) {
        logger.fatal(
          { dbPath: this.config.chatDbPath },
          'Cannot open iMessage database — Full Disk Access is required.\n' +
          '  Fix: System Settings → Privacy & Security → Full Disk Access → add your terminal app, then restart the terminal.\n' +
          '  Verify: sqlite3 ~/Library/Messages/chat.db "SELECT 1;"\n' +
          '  Run "pnpm murph doctor" for a full diagnostic.',
        );
      }
      throw err;
    }

    this.lastRowId = this.chatDb.getMaxRowId();
    logger.info({ lastRowId: this.lastRowId, dbPath: this.config.chatDbPath }, 'iMessage channel started');

    this.pollTimer = setInterval(() => {
      this.poll().catch((err) => {
        logger.error({ err }, 'Error during iMessage poll');
      });
    }, this.config.pollIntervalMs);
  }

  async stop(): Promise<void> {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
    this.chatDb.close();
    logger.info('iMessage channel stopped');
  }

  async sendReply(conversationId: string, content: string): Promise<void> {
    const chatGuid = conversationId.replace('imessage-', '');
    await applescriptSender.sendMessage(chatGuid, content);
    logger.info({ chatGuid }, 'Sent iMessage reply');
  }

  private async poll(): Promise<void> {
    const rows = this.chatDb.fetchNewMessages(this.lastRowId);

    for (const row of rows) {
      this.lastRowId = row.rowid;

      const message = adaptChatDbRow(row);
      if (!message) continue;

      logger.info({ sender: message.sender, rowid: row.rowid }, 'Received iMessage');

      if (this.messageHandler) {
        try {
          await this.messageHandler(message);
        } catch (err) {
          logger.error({ err, rowid: row.rowid }, 'Error handling iMessage');
        }
      }
    }
  }
}

export { adaptChatDbRow } from './adapter.js';
export type { MurphMessage } from './adapter.js';
export { ChatDb } from './chat-db.js';
export { extractText } from './body-parser.js';
export { sendMessage } from './applescript-sender.js';
