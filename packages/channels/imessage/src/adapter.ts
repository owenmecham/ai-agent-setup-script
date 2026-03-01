import { randomUUID } from 'node:crypto';

export interface MurphMessage {
  id: string;
  conversationId: string;
  channel: 'imessage';
  sender: string;
  content: string;
  timestamp: Date;
  metadata?: Record<string, unknown>;
}

export function adaptBlueBubblesMessage(webhook: {
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
}): MurphMessage | null {
  if (webhook.type !== 'new-message' || webhook.data.isFromMe) {
    return null;
  }

  return {
    id: randomUUID(),
    conversationId: `imessage-${webhook.data.chatGuid}`,
    channel: 'imessage',
    sender: webhook.data.handle?.address ?? 'unknown',
    content: webhook.data.text ?? '',
    timestamp: new Date(webhook.data.dateCreated),
    metadata: {
      blueBubblesGuid: webhook.data.guid,
      chatGuid: webhook.data.chatGuid,
      hasAttachments: (webhook.data.attachments?.length ?? 0) > 0,
    },
  };
}
