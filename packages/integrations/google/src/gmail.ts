import type { GwsClient } from './gws-client.js';

export interface ActionResult {
  actionId: string;
  success: boolean;
  data?: unknown;
  error?: string;
}

export interface ActionHandler {
  name: string;
  description: string;
  parameterSchema?: Record<string, unknown>;
  execute: (params: Record<string, unknown>) => Promise<ActionResult>;
}

export function createGmailHandlers(client: GwsClient): ActionHandler[] {
  return [
    {
      name: 'google.gmail.search',
      description: 'Search emails using Gmail query syntax. Params: query (string), maxResults (number, optional, default 20)',
      parameterSchema: {
        type: 'object',
        required: ['query'],
        properties: {
          query: { type: 'string', description: 'Gmail search query (e.g. "is:unread from:boss")' },
          maxResults: { type: 'number', description: 'Max results to return (default 20)' },
        },
      },
      execute: async (params) => {
        try {
          const emails = await client.searchEmails(
            params.query as string,
            (params.maxResults as number) ?? 20,
          );
          return { actionId: '', success: true, data: emails };
        } catch (err) {
          return { actionId: '', success: false, error: err instanceof Error ? err.message : String(err) };
        }
      },
    },
    {
      name: 'google.gmail.get',
      description: 'Read a full email by message ID. Params: messageId (string)',
      parameterSchema: {
        type: 'object',
        required: ['messageId'],
        properties: {
          messageId: { type: 'string', description: 'Gmail message ID' },
        },
      },
      execute: async (params) => {
        try {
          const email = await client.getEmail(params.messageId as string);
          if (!email) return { actionId: '', success: false, error: 'Email not found' };
          return { actionId: '', success: true, data: email };
        } catch (err) {
          return { actionId: '', success: false, error: err instanceof Error ? err.message : String(err) };
        }
      },
    },
    {
      name: 'google.gmail.modify',
      description: 'Add or remove labels from an email (mark read/unread, etc). Params: messageId (string), addLabels (string[], optional), removeLabels (string[], optional)',
      parameterSchema: {
        type: 'object',
        required: ['messageId'],
        properties: {
          messageId: { type: 'string' },
          addLabels: { type: 'array', items: { type: 'string' }, description: 'Label IDs to add' },
          removeLabels: { type: 'array', items: { type: 'string' }, description: 'Label IDs to remove' },
        },
      },
      execute: async (params) => {
        try {
          await client.modifyEmail(
            params.messageId as string,
            params.addLabels as string[] | undefined,
            params.removeLabels as string[] | undefined,
          );
          return { actionId: '', success: true, data: { modified: true } };
        } catch (err) {
          return { actionId: '', success: false, error: err instanceof Error ? err.message : String(err) };
        }
      },
    },
    {
      name: 'google.gmail.archive',
      description: 'Archive an email (removes from inbox). Params: messageId (string)',
      parameterSchema: {
        type: 'object',
        required: ['messageId'],
        properties: {
          messageId: { type: 'string' },
        },
      },
      execute: async (params) => {
        try {
          await client.archiveEmail(params.messageId as string);
          return { actionId: '', success: true, data: { archived: true } };
        } catch (err) {
          return { actionId: '', success: false, error: err instanceof Error ? err.message : String(err) };
        }
      },
    },
    {
      name: 'google.gmail.send',
      description: 'Send an email. Params: to (string), subject (string), body (string), threadId (string, optional for replies)',
      parameterSchema: {
        type: 'object',
        required: ['to', 'subject', 'body'],
        properties: {
          to: { type: 'string', description: 'Recipient email address' },
          subject: { type: 'string' },
          body: { type: 'string' },
          threadId: { type: 'string', description: 'Thread ID for replies' },
        },
      },
      execute: async (params) => {
        try {
          await client.sendEmail(
            params.to as string,
            params.subject as string,
            params.body as string,
            params.threadId as string | undefined,
          );
          return { actionId: '', success: true, data: { sent: true } };
        } catch (err) {
          return { actionId: '', success: false, error: err instanceof Error ? err.message : String(err) };
        }
      },
    },
    {
      name: 'google.gmail.draft',
      description: 'Create a draft email. Params: to (string), subject (string), body (string), threadId (string, optional)',
      parameterSchema: {
        type: 'object',
        required: ['to', 'subject', 'body'],
        properties: {
          to: { type: 'string' },
          subject: { type: 'string' },
          body: { type: 'string' },
          threadId: { type: 'string' },
        },
      },
      execute: async (params) => {
        try {
          await client.createDraft(
            params.to as string,
            params.subject as string,
            params.body as string,
            params.threadId as string | undefined,
          );
          return { actionId: '', success: true, data: { drafted: true } };
        } catch (err) {
          return { actionId: '', success: false, error: err instanceof Error ? err.message : String(err) };
        }
      },
    },
    {
      name: 'google.gmail.reply',
      description: 'Reply to an email thread. Params: to (string), subject (string), body (string), threadId (string)',
      parameterSchema: {
        type: 'object',
        required: ['to', 'subject', 'body', 'threadId'],
        properties: {
          to: { type: 'string' },
          subject: { type: 'string' },
          body: { type: 'string' },
          threadId: { type: 'string' },
        },
      },
      execute: async (params) => {
        try {
          const subject = (params.subject as string).startsWith('Re:')
            ? params.subject as string
            : `Re: ${params.subject as string}`;
          await client.sendEmail(
            params.to as string,
            subject,
            params.body as string,
            params.threadId as string,
          );
          return { actionId: '', success: true, data: { replied: true } };
        } catch (err) {
          return { actionId: '', success: false, error: err instanceof Error ? err.message : String(err) };
        }
      },
    },
    {
      name: 'google.gmail.labels.list',
      description: 'List all Gmail labels',
      execute: async () => {
        try {
          const labels = await client.listLabels();
          return { actionId: '', success: true, data: labels };
        } catch (err) {
          return { actionId: '', success: false, error: err instanceof Error ? err.message : String(err) };
        }
      },
    },
    {
      name: 'google.gmail.labels.create',
      description: 'Create a new Gmail label. Params: name (string)',
      parameterSchema: {
        type: 'object',
        required: ['name'],
        properties: {
          name: { type: 'string', description: 'Label name' },
        },
      },
      execute: async (params) => {
        try {
          const label = await client.createLabel(params.name as string);
          return { actionId: '', success: true, data: label };
        } catch (err) {
          return { actionId: '', success: false, error: err instanceof Error ? err.message : String(err) };
        }
      },
    },
  ];
}
