import type { GwsClient } from './gws-client.js';
import type { ActionHandler } from './gmail.js';

export function createDocsHandlers(client: GwsClient): ActionHandler[] {
  return [
    {
      name: 'google.docs.get',
      description: 'Read a Google Doc. Params: documentId (string)',
      parameterSchema: {
        type: 'object',
        required: ['documentId'],
        properties: {
          documentId: { type: 'string' },
        },
      },
      execute: async (params) => {
        try {
          const doc = await client.getDoc(params.documentId as string);
          return { actionId: '', success: true, data: doc };
        } catch (err) {
          return { actionId: '', success: false, error: err instanceof Error ? err.message : String(err) };
        }
      },
    },
    {
      name: 'google.docs.create',
      description: 'Create a new Google Doc. Params: title (string)',
      parameterSchema: {
        type: 'object',
        required: ['title'],
        properties: {
          title: { type: 'string' },
        },
      },
      execute: async (params) => {
        try {
          const doc = await client.createDoc(params.title as string);
          return { actionId: '', success: true, data: doc };
        } catch (err) {
          return { actionId: '', success: false, error: err instanceof Error ? err.message : String(err) };
        }
      },
    },
  ];
}
