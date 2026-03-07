import { Cron } from 'croner';
import type { Pool } from 'pg';
import pino from 'pino';

const logger = pino({ name: 'scheduler' });

export interface ScheduledTask {
  id: string;
  name: string;
  cronExpression: string;
  action: string;
  parameters: Record<string, unknown>;
  channel?: string;
  conversationId?: string;
  enabled: boolean;
  lastRunAt?: Date;
  nextRunAt?: Date;
}

type TaskExecutor = (task: ScheduledTask) => Promise<void>;

export class Scheduler {
  private pool: Pool;
  private jobs = new Map<string, Cron>();
  private executor?: TaskExecutor;

  constructor(pool: Pool) {
    this.pool = pool;
  }

  onTaskDue(executor: TaskExecutor): void {
    this.executor = executor;
  }

  async start(): Promise<void> {
    // Load all enabled tasks from DB
    const result = await this.pool.query(
      `SELECT * FROM scheduled_tasks WHERE enabled = true`,
    );

    for (const row of result.rows) {
      const task = this.rowToTask(row);
      this.scheduleJob(task);
    }

    logger.info({ count: result.rows.length }, 'Scheduler started');
  }

  async stop(): Promise<void> {
    for (const [id, job] of this.jobs) {
      job.stop();
    }
    this.jobs.clear();
    logger.info('Scheduler stopped');
  }

  async createTask(task: Omit<ScheduledTask, 'id' | 'lastRunAt' | 'nextRunAt'>): Promise<ScheduledTask> {
    const result = await this.pool.query(
      `INSERT INTO scheduled_tasks (name, cron_expression, action, parameters, channel, conversation_id, enabled)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [task.name, task.cronExpression, task.action, JSON.stringify(task.parameters), task.channel, task.conversationId, task.enabled],
    );

    const created = this.rowToTask(result.rows[0]);
    if (created.enabled) {
      this.scheduleJob(created);
    }

    logger.info({ taskId: created.id, name: created.name }, 'Task created');
    return created;
  }

  async updateTask(id: string, updates: Partial<ScheduledTask>): Promise<void> {
    const sets: string[] = [];
    const params: unknown[] = [];
    let idx = 1;

    if (updates.name !== undefined) { sets.push(`name = $${idx++}`); params.push(updates.name); }
    if (updates.cronExpression !== undefined) { sets.push(`cron_expression = $${idx++}`); params.push(updates.cronExpression); }
    if (updates.action !== undefined) { sets.push(`action = $${idx++}`); params.push(updates.action); }
    if (updates.parameters !== undefined) { sets.push(`parameters = $${idx++}`); params.push(JSON.stringify(updates.parameters)); }
    if (updates.enabled !== undefined) { sets.push(`enabled = $${idx++}`); params.push(updates.enabled); }

    sets.push(`updated_at = NOW()`);
    params.push(id);

    await this.pool.query(
      `UPDATE scheduled_tasks SET ${sets.join(', ')} WHERE id = $${idx}`,
      params,
    );

    // Reschedule
    const existing = this.jobs.get(id);
    if (existing) {
      existing.stop();
      this.jobs.delete(id);
    }

    if (updates.enabled !== false) {
      const result = await this.pool.query(`SELECT * FROM scheduled_tasks WHERE id = $1`, [id]);
      if (result.rows.length > 0) {
        this.scheduleJob(this.rowToTask(result.rows[0]));
      }
    }
  }

  async deleteTask(id: string): Promise<void> {
    const existing = this.jobs.get(id);
    if (existing) {
      existing.stop();
      this.jobs.delete(id);
    }
    await this.pool.query(`DELETE FROM scheduled_tasks WHERE id = $1`, [id]);
    logger.info({ taskId: id }, 'Task deleted');
  }

  async listTasks(): Promise<ScheduledTask[]> {
    const result = await this.pool.query(`SELECT * FROM scheduled_tasks ORDER BY created_at DESC`);
    return result.rows.map(this.rowToTask);
  }

  async findTasksByName(query: string): Promise<ScheduledTask[]> {
    const result = await this.pool.query(
      `SELECT * FROM scheduled_tasks WHERE name ILIKE $1 ORDER BY created_at DESC`,
      [`%${query}%`],
    );
    return result.rows.map(this.rowToTask);
  }

  private scheduleJob(task: ScheduledTask): void {
    try {
      const job = new Cron(task.cronExpression, async () => {
        logger.info({ taskId: task.id, name: task.name }, 'Task triggered');
        await this.pool.query(
          `UPDATE scheduled_tasks SET last_run_at = NOW() WHERE id = $1`,
          [task.id],
        );
        if (this.executor) {
          await this.executor(task);
        }
      });

      this.jobs.set(task.id, job);
    } catch (err) {
      logger.error({ err, taskId: task.id }, 'Failed to schedule task');
    }
  }

  private rowToTask(row: Record<string, unknown>): ScheduledTask {
    return {
      id: row.id as string,
      name: row.name as string,
      cronExpression: row.cron_expression as string,
      action: row.action as string,
      parameters: (row.parameters ?? {}) as Record<string, unknown>,
      channel: row.channel as string | undefined,
      conversationId: row.conversation_id as string | undefined,
      enabled: row.enabled as boolean,
      lastRunAt: row.last_run_at as Date | undefined,
      nextRunAt: row.next_run_at as Date | undefined,
    };
  }
}
