import type { GwsClient } from './gws-client.js';
import type { ActionHandler } from './gmail.js';

export function createTasksHandlers(client: GwsClient): ActionHandler[] {
  return [
    {
      name: 'google.tasks.list',
      description: 'List task lists and their tasks. Params: taskListId (string, optional — if omitted, lists all task lists)',
      parameterSchema: {
        type: 'object',
        properties: {
          taskListId: { type: 'string', description: 'Task list ID. If omitted, returns all task lists.' },
        },
      },
      execute: async (params) => {
        try {
          if (params.taskListId) {
            const tasks = await client.listTasks(params.taskListId as string);
            return { actionId: '', success: true, data: tasks };
          }
          const taskLists = await client.listTaskLists();
          return { actionId: '', success: true, data: taskLists };
        } catch (err) {
          return { actionId: '', success: false, error: err instanceof Error ? err.message : String(err) };
        }
      },
    },
    {
      name: 'google.tasks.create',
      description: 'Create a new task. Params: taskListId (string — use "@default" for default list), title (string), notes (string, optional), due (ISO date string, optional)',
      parameterSchema: {
        type: 'object',
        required: ['taskListId', 'title'],
        properties: {
          taskListId: { type: 'string', description: 'Task list ID (use "@default" for default)' },
          title: { type: 'string' },
          notes: { type: 'string' },
          due: { type: 'string', description: 'Due date (ISO 8601)' },
        },
      },
      execute: async (params) => {
        try {
          const task = await client.createTask(
            params.taskListId as string,
            {
              title: params.title as string,
              notes: params.notes as string | undefined,
              due: params.due as string | undefined,
            },
          );
          return { actionId: '', success: true, data: task };
        } catch (err) {
          return { actionId: '', success: false, error: err instanceof Error ? err.message : String(err) };
        }
      },
    },
    {
      name: 'google.tasks.update',
      description: 'Update a task (title, notes, due date). Params: taskListId (string), taskId (string), title (string, optional), notes (string, optional), due (ISO date, optional)',
      parameterSchema: {
        type: 'object',
        required: ['taskListId', 'taskId'],
        properties: {
          taskListId: { type: 'string' },
          taskId: { type: 'string' },
          title: { type: 'string' },
          notes: { type: 'string' },
          due: { type: 'string' },
        },
      },
      execute: async (params) => {
        try {
          const { taskListId, taskId, ...updates } = params;
          const task = await client.updateTask(
            taskListId as string,
            taskId as string,
            updates as any,
          );
          return { actionId: '', success: true, data: task };
        } catch (err) {
          return { actionId: '', success: false, error: err instanceof Error ? err.message : String(err) };
        }
      },
    },
    {
      name: 'google.tasks.complete',
      description: 'Mark a task as completed. Params: taskListId (string), taskId (string)',
      parameterSchema: {
        type: 'object',
        required: ['taskListId', 'taskId'],
        properties: {
          taskListId: { type: 'string' },
          taskId: { type: 'string' },
        },
      },
      execute: async (params) => {
        try {
          const task = await client.completeTask(
            params.taskListId as string,
            params.taskId as string,
          );
          return { actionId: '', success: true, data: task };
        } catch (err) {
          return { actionId: '', success: false, error: err instanceof Error ? err.message : String(err) };
        }
      },
    },
  ];
}
