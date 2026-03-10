import type { GoogleClient } from './google-client.js';
import { createGmailHandlers } from './gmail.js';
import { createCalendarHandlers } from './calendar.js';
import { createTasksHandlers } from './tasks.js';
import { createDriveHandlers } from './drive.js';

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
 * Each handler delegates to GoogleClient methods.
 */
export function registerGoogleTools(registry: ActionRegistry, client: GoogleClient): void {
  const allHandlers = [
    ...createGmailHandlers(client),
    ...createCalendarHandlers(client),
    ...createTasksHandlers(client),
    ...createDriveHandlers(client),
  ];

  for (const handler of allHandlers) {
    registry.register(handler);
  }
}
