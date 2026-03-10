import type { GwsClient } from './gws-client.js';
import type { ActionHandler } from './gmail.js';

export function createSheetsHandlers(client: GwsClient): ActionHandler[] {
  return [
    {
      name: 'google.sheets.get',
      description: 'Read spreadsheet data. Params: spreadsheetId (string), range (string, e.g. "Sheet1!A1:D10")',
      parameterSchema: {
        type: 'object',
        required: ['spreadsheetId', 'range'],
        properties: {
          spreadsheetId: { type: 'string' },
          range: { type: 'string', description: 'A1 notation range (e.g. "Sheet1!A1:D10")' },
        },
      },
      execute: async (params) => {
        try {
          const data = await client.getSheetValues(
            params.spreadsheetId as string,
            params.range as string,
          );
          return { actionId: '', success: true, data };
        } catch (err) {
          return { actionId: '', success: false, error: err instanceof Error ? err.message : String(err) };
        }
      },
    },
    {
      name: 'google.sheets.create',
      description: 'Create a new spreadsheet. Params: title (string)',
      parameterSchema: {
        type: 'object',
        required: ['title'],
        properties: {
          title: { type: 'string' },
        },
      },
      execute: async (params) => {
        try {
          const sheet = await client.createSpreadsheet(params.title as string);
          return { actionId: '', success: true, data: sheet };
        } catch (err) {
          return { actionId: '', success: false, error: err instanceof Error ? err.message : String(err) };
        }
      },
    },
    {
      name: 'google.sheets.modify',
      description: 'Update spreadsheet values. Params: spreadsheetId (string), range (string), values (2D array)',
      parameterSchema: {
        type: 'object',
        required: ['spreadsheetId', 'range', 'values'],
        properties: {
          spreadsheetId: { type: 'string' },
          range: { type: 'string' },
          values: { type: 'array', description: '2D array of cell values' },
        },
      },
      execute: async (params) => {
        try {
          await client.updateSheetValues(
            params.spreadsheetId as string,
            params.range as string,
            params.values as unknown[][],
          );
          return { actionId: '', success: true, data: { updated: true } };
        } catch (err) {
          return { actionId: '', success: false, error: err instanceof Error ? err.message : String(err) };
        }
      },
    },
  ];
}
