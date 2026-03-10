import type { GwsClient } from './gws-client.js';
import type { ActionHandler } from './gmail.js';

export function createChatHandlers(client: GwsClient): ActionHandler[] {
  return [
    {
      name: 'google.chat.send',
      description: 'Send a Google Chat message. Params: spaceName (string — the Chat space resource name), text (string)',
      parameterSchema: {
        type: 'object',
        required: ['spaceName', 'text'],
        properties: {
          spaceName: { type: 'string', description: 'Chat space resource name (e.g. "spaces/AAAA...")' },
          text: { type: 'string', description: 'Message text' },
        },
      },
      execute: async (params) => {
        try {
          await client.sendChatMessage(
            params.spaceName as string,
            params.text as string,
          );
          return { actionId: '', success: true, data: { sent: true } };
        } catch (err) {
          return { actionId: '', success: false, error: err instanceof Error ? err.message : String(err) };
        }
      },
    },
  ];
}
