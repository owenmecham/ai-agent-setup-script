import type { GwsClient } from './gws-client.js';
import type { ActionHandler, ActionResult } from './gmail.js';

export function createCalendarHandlers(client: GwsClient): ActionHandler[] {
  return [
    {
      name: 'google.calendar.list',
      description: 'List calendar events in a time range. Params: timeMin (ISO string), timeMax (ISO string)',
      parameterSchema: {
        type: 'object',
        required: ['timeMin', 'timeMax'],
        properties: {
          timeMin: { type: 'string', description: 'Start of time range (ISO 8601)' },
          timeMax: { type: 'string', description: 'End of time range (ISO 8601)' },
        },
      },
      execute: async (params) => {
        try {
          const events = await client.listCalendarEvents(
            params.timeMin as string,
            params.timeMax as string,
          );
          return { actionId: '', success: true, data: events };
        } catch (err) {
          return { actionId: '', success: false, error: err instanceof Error ? err.message : String(err) };
        }
      },
    },
    {
      name: 'google.calendar.create',
      description: 'Create a calendar event. Params: summary (string), startDateTime (ISO string), endDateTime (ISO string), description (string, optional), location (string, optional), timeZone (string, optional)',
      parameterSchema: {
        type: 'object',
        required: ['summary', 'startDateTime', 'endDateTime'],
        properties: {
          summary: { type: 'string', description: 'Event title' },
          startDateTime: { type: 'string', description: 'Start time (ISO 8601)' },
          endDateTime: { type: 'string', description: 'End time (ISO 8601)' },
          description: { type: 'string' },
          location: { type: 'string' },
          timeZone: { type: 'string' },
        },
      },
      execute: async (params) => {
        try {
          const event = await client.createCalendarEvent({
            summary: params.summary as string,
            description: params.description as string | undefined,
            location: params.location as string | undefined,
            start: {
              dateTime: params.startDateTime as string,
              timeZone: params.timeZone as string | undefined,
            },
            end: {
              dateTime: params.endDateTime as string,
              timeZone: params.timeZone as string | undefined,
            },
          });
          return { actionId: '', success: true, data: event };
        } catch (err) {
          return { actionId: '', success: false, error: err instanceof Error ? err.message : String(err) };
        }
      },
    },
  ];
}
