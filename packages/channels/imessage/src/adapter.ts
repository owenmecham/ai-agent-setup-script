import { randomUUID } from 'node:crypto';
import type { ChatDbRow } from './chat-db.js';
import { extractText } from './body-parser.js';

export interface MurphMessage {
  id: string;
  conversationId: string;
  channel: 'imessage';
  sender: string;
  content: string;
  timestamp: Date;
  metadata?: Record<string, unknown>;
}

export interface AttachmentInfo {
  path: string;
  mimeType: string;
  name: string;
}

/**
 * Converts a raw SQLite row from chat.db into a MurphMessage.
 * Returns null for rows that should be filtered out (tapbacks, empty messages, etc).
 */
export function adaptChatDbRow(row: ChatDbRow): MurphMessage | null {
  // Filter tapback reactions (associated_message_type != 0)
  if (row.associated_message_type !== 0) {
    return null;
  }

  // Filter messages with no sender or no chat
  if (!row.sender || !row.chat_guid) {
    return null;
  }

  const content = extractText(row.attributedBody, row.text);
  const attachments = parseAttachments(row);

  // Filter messages with no content and no attachments
  if (!content && attachments.length === 0) {
    return null;
  }

  return {
    id: randomUUID(),
    conversationId: `imessage-${row.chat_guid}`,
    channel: 'imessage',
    sender: row.sender,
    content,
    timestamp: new Date(),
    metadata: {
      chatGuid: row.chat_guid,
      hasAttachments: row.cache_has_attachments === 1,
      attachments,
    },
  };
}

function parseAttachments(row: ChatDbRow): AttachmentInfo[] {
  if (!row.attachment_paths) {
    return [];
  }

  const paths = row.attachment_paths.split('||');
  const mimes = row.attachment_mimes?.split('||') ?? [];
  const names = row.attachment_names?.split('||') ?? [];

  const result: AttachmentInfo[] = [];
  for (let i = 0; i < paths.length; i++) {
    if (paths[i]) {
      result.push({
        path: paths[i],
        mimeType: mimes[i] ?? 'application/octet-stream',
        name: names[i] ?? '',
      });
    }
  }

  return result;
}
