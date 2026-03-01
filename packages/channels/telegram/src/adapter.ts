import { randomUUID } from 'node:crypto';

export interface MurphMessage {
  id: string;
  conversationId: string;
  channel: 'telegram';
  sender: string;
  content: string;
  timestamp: Date;
  metadata?: Record<string, unknown>;
}

export function adaptTelegramMessage(msg: {
  message_id: number;
  chat: { id: number; type: string; title?: string };
  from?: { id: number; first_name: string; last_name?: string; username?: string };
  text?: string;
  date: number;
}): MurphMessage {
  return {
    id: randomUUID(),
    conversationId: `telegram-${msg.chat.id}`,
    channel: 'telegram',
    sender: msg.from?.username ?? msg.from?.first_name ?? 'unknown',
    content: msg.text ?? '',
    timestamp: new Date(msg.date * 1000),
    metadata: {
      telegramMessageId: msg.message_id,
      telegramChatId: msg.chat.id,
      telegramUserId: msg.from?.id,
      chatType: msg.chat.type,
    },
  };
}
