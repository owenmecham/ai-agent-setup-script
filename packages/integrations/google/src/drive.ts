import type { GwsClient } from './gws-client.js';
import type { ActionHandler } from './gmail.js';

export function createDriveHandlers(client: GwsClient): ActionHandler[] {
  return [
    {
      name: 'google.drive.list',
      description: 'List or search Drive files. Params: query (string, optional — Drive query syntax), maxResults (number, optional, default 20)',
      parameterSchema: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Drive search query (e.g. "name contains \'report\'")' },
          maxResults: { type: 'number', description: 'Max results (default 20)' },
        },
      },
      execute: async (params) => {
        try {
          const files = await client.listDriveFiles(
            params.query as string | undefined,
            (params.maxResults as number) ?? 20,
          );
          return { actionId: '', success: true, data: files };
        } catch (err) {
          return { actionId: '', success: false, error: err instanceof Error ? err.message : String(err) };
        }
      },
    },
    {
      name: 'google.drive.get',
      description: 'Get file metadata from Drive. Params: fileId (string)',
      parameterSchema: {
        type: 'object',
        required: ['fileId'],
        properties: {
          fileId: { type: 'string' },
        },
      },
      execute: async (params) => {
        try {
          const file = await client.getDriveFile(params.fileId as string);
          return { actionId: '', success: true, data: file };
        } catch (err) {
          return { actionId: '', success: false, error: err instanceof Error ? err.message : String(err) };
        }
      },
    },
    {
      name: 'google.drive.create',
      description: 'Create a file in Drive. Params: name (string), mimeType (string)',
      parameterSchema: {
        type: 'object',
        required: ['name', 'mimeType'],
        properties: {
          name: { type: 'string' },
          mimeType: { type: 'string', description: 'e.g. "application/vnd.google-apps.document"' },
        },
      },
      execute: async (params) => {
        try {
          const file = await client.createDriveFile(
            params.name as string,
            params.mimeType as string,
          );
          return { actionId: '', success: true, data: file };
        } catch (err) {
          return { actionId: '', success: false, error: err instanceof Error ? err.message : String(err) };
        }
      },
    },
  ];
}
