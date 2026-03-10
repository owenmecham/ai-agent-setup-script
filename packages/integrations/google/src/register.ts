import type { GwsClient } from './gws-client.js';
import { createGmailHandlers } from './gmail.js';
import { createCalendarHandlers } from './calendar.js';
import { createTasksHandlers } from './tasks.js';
import { createDriveHandlers } from './drive.js';
import { createDocsHandlers } from './docs.js';
import { createSheetsHandlers } from './sheets.js';
import { createChatHandlers } from './chat.js';

interface ActionRegistry {
  register(handler: {
    name: string;
    description: string;
    parameterSchema?: Record<string, unknown>;
    execute: (params: Record<string, unknown>) => Promise<{ actionId: string; success: boolean; data?: unknown; error?: string }>;
  }): void;
}

/**
 * Register all Google Workspace action handlers in the given registry.
 * Each handler delegates to GwsClient methods.
 */
export function registerGoogleTools(registry: ActionRegistry, client: GwsClient): void {
  const allHandlers = [
    ...createGmailHandlers(client),
    ...createCalendarHandlers(client),
    ...createTasksHandlers(client),
    ...createDriveHandlers(client),
    ...createDocsHandlers(client),
    ...createSheetsHandlers(client),
    ...createChatHandlers(client),
  ];

  for (const handler of allHandlers) {
    registry.register(handler);
  }
}
