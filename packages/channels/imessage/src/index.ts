import { ChatDb } from './chat-db.js';
import { adaptChatDbRow, type MurphMessage } from './adapter.js';
import * as applescriptSender from './applescript-sender.js';
import pino from 'pino';

export interface IMessageLogger {
  info(obj: Record<string, unknown>, msg: string): void;
  warn(obj: Record<string, unknown>, msg: string): void;
  error(obj: Record<string, unknown>, msg: string): void;
  debug(obj: Record<string, unknown>, msg: string): void;
}

export interface IMessageChannelConfig {
  chatDbPath: string;
  pollIntervalMs: number;
  logger?: IMessageLogger;
}

type MessageHandler = (message: MurphMessage) => Promise<void>;

export class IMessageChannel {
  readonly name = 'imessage';
  private chatDb: ChatDb;
  private config: IMessageChannelConfig;
  private lastRowId = 0;
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private messageHandler?: MessageHandler;
  private logger: IMessageLogger;
  private lastHeartbeat = 0;
  private pollCount = 0;
  private isPolling = false;

  constructor(config: IMessageChannelConfig) {
    this.config = config;
    this.logger = config.logger ?? pino({ name: 'channel-imessage' });
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
        this.logger.error(
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
    this.logger.info({ lastRowId: this.lastRowId, dbPath: this.config.chatDbPath }, 'iMessage channel started');

    this.pollTimer = setInterval(() => {
      this.poll().catch((err) => {
        this.logger.error({ err }, 'Error during iMessage poll');
      });
    }, this.config.pollIntervalMs);
  }

  async stop(): Promise<void> {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
    this.chatDb.close();
    this.logger.info({}, 'iMessage channel stopped');
  }

  async sendReply(conversationId: string, content: string): Promise<void> {
    const chatGuid = conversationId.replace('imessage-', '');
    await applescriptSender.sendMessage(chatGuid, content);
    this.logger.info({ chatGuid }, 'Sent iMessage reply');
  }

  private async poll(): Promise<void> {
    if (this.isPolling) return;
    this.isPolling = true;
    try {
      this.pollCount++;
      const now = Date.now();

      if (!Number.isFinite(this.lastRowId)) {
        const recovered = this.chatDb.getMaxRowId();
        this.logger.warn(
          { corruptValue: this.lastRowId, recoveredTo: recovered },
          'lastRowId was corrupt — resetting to current max',
        );
        this.lastRowId = recovered;
      }

      const rows = this.chatDb.fetchNewMessages(this.lastRowId);

      // Heartbeat every 30 seconds so we know the poll loop is alive
      if (now - this.lastHeartbeat >= 30_000) {
        const dbMaxRowId = this.chatDb.getMaxRowId();
        const gap = dbMaxRowId - this.lastRowId;
        this.logger.info(
          { pollCount: this.pollCount, lastRowId: this.lastRowId, dbMaxRowId, rowsFound: rows.length, gap },
          'iMessage poll heartbeat',
        );
        if (gap > 0) {
          this.logger.warn(
            { gap, lastRowId: this.lastRowId, dbMaxRowId },
            'iMessage poll has unprocessed rows in gap',
          );
        }
        this.lastHeartbeat = now;
      }

      for (const row of rows) {
        if (typeof row.rowid !== 'number') {
          this.logger.warn(
            { rowid: row.rowid, rowidType: typeof row.rowid, rowKeys: Object.keys(row) },
            'Unexpected rowid type from chat.db',
          );
        }
        this.lastRowId = row.rowid;

        if (row.is_from_me) {
          this.logger.info({ rowid: row.rowid }, 'Skipped outgoing iMessage row');
          continue;
        }

        const message = adaptChatDbRow(row);
        if (!message) {
          this.logger.warn(
            {
              rowid: row.rowid,
              sender: row.sender ?? null,
              chatGuid: row.chat_guid ?? null,
              associatedMessageType: row.associated_message_type,
              hasText: !!row.text,
              hasAttributedBody: !!row.attributedBody,
            },
            'Filtered iMessage row',
          );
          continue;
        }

        this.logger.info({ sender: message.sender, rowid: row.rowid, lastRowId: this.lastRowId }, 'Received iMessage');

        if (this.messageHandler) {
          try {
            await this.messageHandler(message);
            this.logger.info({ rowid: row.rowid }, 'Finished handling iMessage');
          } catch (err) {
            this.logger.error({ err, rowid: row.rowid }, 'Error handling iMessage');
          }
        }
      }
    } finally {
      this.isPolling = false;
    }
  }
}

export { adaptChatDbRow } from './adapter.js';
export type { MurphMessage } from './adapter.js';
export { ChatDb } from './chat-db.js';
export { extractText } from './body-parser.js';
export { sendMessage } from './applescript-sender.js';
