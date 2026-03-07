import type { Action, ActionHandler, ActionResult, ToolDescription } from './types.js';
import { createLogger } from './logger.js';

const logger = createLogger('action-registry');

export class ActionRegistry {
  private handlers = new Map<string, ActionHandler>();

  register(handler: ActionHandler): void {
    if (this.handlers.has(handler.name)) {
      logger.warn({ name: handler.name }, 'Overwriting existing action handler');
    }
    this.handlers.set(handler.name, handler);
    logger.info({ name: handler.name }, 'Registered action handler');
  }

  unregister(name: string): void {
    this.handlers.delete(name);
  }

  getToolDescriptions(): ToolDescription[] {
    return Array.from(this.handlers.values()).map((h) => ({
      name: h.name,
      description: h.description,
      parameterSchema: h.parameterSchema,
    }));
  }

  async execute(action: Action): Promise<ActionResult> {
    const handler = this.handlers.get(action.name);
    if (!handler) {
      return {
        actionId: action.id,
        success: false,
        error: `No handler registered for action: ${action.name}`,
      };
    }

    try {
      return await handler.execute(action.parameters);
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      logger.error({ action: action.name, error }, 'Action execution failed');
      return {
        actionId: action.id,
        success: false,
        error,
      };
    }
  }

  has(name: string): boolean {
    return this.handlers.has(name);
  }

  list(): string[] {
    return Array.from(this.handlers.keys());
  }
}
