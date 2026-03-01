import type { Pool } from 'pg';

export class TaskStore {
  constructor(private pool: Pool) {}

  async getTasksDueBefore(date: Date): Promise<Array<{
    id: string;
    name: string;
    action: string;
    parameters: Record<string, unknown>;
    channel?: string;
    conversationId?: string;
  }>> {
    const result = await this.pool.query(
      `SELECT id, name, action, parameters, channel, conversation_id
       FROM scheduled_tasks
       WHERE enabled = true AND (next_run_at IS NULL OR next_run_at <= $1)`,
      [date],
    );

    return result.rows.map((row: Record<string, unknown>) => ({
      id: row.id as string,
      name: row.name as string,
      action: row.action as string,
      parameters: (row.parameters ?? {}) as Record<string, unknown>,
      channel: row.channel as string | undefined,
      conversationId: row.conversation_id as string | undefined,
    }));
  }

  async markRun(taskId: string): Promise<void> {
    await this.pool.query(
      `UPDATE scheduled_tasks SET last_run_at = NOW() WHERE id = $1`,
      [taskId],
    );
  }
}
