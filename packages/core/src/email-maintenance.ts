import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import type { Pool } from 'pg';
import { createLogger } from './logger.js';

const logger = createLogger('email-maintenance');

interface EmailMaintenanceConfig {
  enabled: boolean;
  goal: string;
  model: 'haiku' | 'sonnet' | 'opus';
  cadence: '15m' | '30m' | '1h' | '6h' | 'daily';
  next_steps: string;
  gmail_query: string;
  lookback_window: '1h' | '6h' | '24h' | '3d' | '7d';
  max_emails_per_run: number;
  only_unread: boolean;
  scan_labels: string[];
  snippet_length: number;
  mark_read: boolean;
  archive: boolean;
  apply_label: string;
  auto_tasking: boolean;
  task_list: string;
  reply_enabled: boolean;
  reply_mode: 'draft' | 'send';
  forward_to: string;
  calendar_aware: boolean;
  max_budget_per_run_usd: number;
  batch_size: number;
  run_window_start: string;
  run_window_end: string;
  notify_channel: 'dashboard' | 'imessage' | 'telegram' | 'none';
  notify_on: 'always' | 'matches_only' | 'errors_only';
  privacy_keywords: string[];
}

interface McpManager {
  callTool(serverName: string, toolName: string, args: Record<string, unknown>): Promise<unknown>;
  getTools(serverName?: string): Array<{ server: string; name: string; description: string; inputSchema?: unknown }>;
  isConnected(name: string): boolean;
}

interface EmailDetail {
  email_index: number;
  message_id: string;
  subject: string;
  from: string;
  matches_goal: boolean;
  reason: string;
  actions: string[];
  reply?: { body: string } | null;
  forward?: boolean;
  task?: { title: string; notes: string; due?: string } | null;
}

interface RunRecord {
  id: string;
  status: string;
  dry_run: boolean;
  goal: string | null;
  model: string | null;
  emails_scanned: number;
  emails_matched: number;
  emails_archived: number;
  emails_marked_read: number;
  emails_labeled: number;
  emails_replied: number;
  emails_forwarded: number;
  tasks_created: number;
  summary: string | null;
  details: unknown;
  error: string | null;
  started_at: string;
  completed_at: string | null;
  created_at: string;
}

const CADENCE_CRON: Record<string, string> = {
  '15m': '*/15 * * * *',
  '30m': '*/30 * * * *',
  '1h': '0 * * * *',
  '6h': '0 */6 * * *',
  'daily': '0 9 * * *',
};

const LOOKBACK_MS: Record<string, number> = {
  '1h': 60 * 60 * 1000,
  '6h': 6 * 60 * 60 * 1000,
  '24h': 24 * 60 * 60 * 1000,
  '3d': 3 * 24 * 60 * 60 * 1000,
  '7d': 7 * 24 * 60 * 60 * 1000,
};

export class EmailMaintenanceEngine {
  private mcpManager: McpManager;
  private pool: Pool;
  private cronJob: ReturnType<typeof setInterval> | null = null;
  private running = false;
  private timezone: string;

  constructor(mcpManager: McpManager, pool: Pool, timezone: string = 'America/Denver') {
    this.mcpManager = mcpManager;
    this.pool = pool;
    this.timezone = timezone;
  }

  startCron(config: EmailMaintenanceConfig): void {
    this.stopCron();

    if (!config.enabled) {
      logger.info('Email maintenance disabled, skipping cron setup');
      return;
    }

    const cronExpression = CADENCE_CRON[config.cadence] ?? '0 * * * *';
    // Use setInterval to approximate cron schedules
    const intervalMs = this.cadenceToMs(config.cadence);

    logger.info({ cadence: config.cadence, intervalMs }, 'Email maintenance cron started');

    // Run immediately on start if enabled
    this.cronJob = setInterval(async () => {
      if (this.running) {
        logger.info('Skipping email maintenance run — previous run still in progress');
        return;
      }
      try {
        await this.run(config, false);
      } catch (err) {
        logger.error({ err }, 'Email maintenance cron run failed');
      }
    }, intervalMs);
  }

  stopCron(): void {
    if (this.cronJob) {
      clearInterval(this.cronJob);
      this.cronJob = null;
      logger.info('Email maintenance cron stopped');
    }
  }

  reconfigure(config: EmailMaintenanceConfig): void {
    this.stopCron();
    this.startCron(config);
  }

  async run(config: EmailMaintenanceConfig, dryRun: boolean, runId?: string): Promise<string> {
    if (this.running) {
      throw new Error('Email maintenance run already in progress');
    }
    this.running = true;

    const id = runId ?? randomUUID();

    try {
      // Check run window
      if (!this.isWithinRunWindow(config)) {
        logger.info('Outside configured run window, skipping');
        this.running = false;
        return id;
      }

      // Create run record
      await this.createRunRecord(id, config, dryRun);

      // Verify Google MCP is connected
      if (!this.mcpManager.isConnected('google')) {
        throw new Error('Google MCP server is not connected');
      }

      // Discover available Gmail tools
      const googleTools = this.mcpManager.getTools('google');
      const toolNames = googleTools.map(t => t.name);
      logger.info({ toolCount: toolNames.length }, 'Discovered Google MCP tools');

      // Fetch emails
      const emails = await this.fetchEmails(config);
      logger.info({ count: emails.length }, 'Fetched emails');

      // Privacy scrub
      const filteredEmails = this.privacyScrub(emails, config.privacy_keywords);
      const skippedCount = emails.length - filteredEmails.length;
      if (skippedCount > 0) {
        logger.info({ skipped: skippedCount }, 'Emails skipped due to privacy keywords');
      }

      // Fetch calendar openings if calendar_aware
      let calendarContext = '';
      if (config.calendar_aware) {
        calendarContext = await this.fetchCalendarOpenings();
      }

      // LLM analysis in batches
      const allDecisions: EmailDetail[] = [];
      for (let i = 0; i < filteredEmails.length; i += config.batch_size) {
        const batch = filteredEmails.slice(i, i + config.batch_size);
        const decisions = await this.analyzeEmails(batch, config, calendarContext);
        allDecisions.push(...decisions);
      }

      const matched = allDecisions.filter(d => d.matches_goal);

      // Execute actions (skip if dry run)
      const counters = {
        archived: 0,
        marked_read: 0,
        labeled: 0,
        replied: 0,
        forwarded: 0,
        tasks_created: 0,
      };

      if (!dryRun) {
        for (const decision of matched) {
          try {
            await this.executeActions(decision, config, counters);
          } catch (err) {
            logger.error({ err, messageId: decision.message_id }, 'Failed to execute actions for email');
          }
        }
      }

      // Build summary
      const summary = dryRun
        ? `Dry run: scanned ${filteredEmails.length} emails, ${matched.length} matched goal. No actions taken.`
        : `Scanned ${filteredEmails.length} emails, ${matched.length} matched goal. ` +
          `Archived: ${counters.archived}, Read: ${counters.marked_read}, Labeled: ${counters.labeled}, ` +
          `Replied: ${counters.replied}, Forwarded: ${counters.forwarded}, Tasks: ${counters.tasks_created}`;

      // Update run record
      await this.pool.query(
        `UPDATE email_maintenance_runs SET
          status = 'completed',
          emails_scanned = $2,
          emails_matched = $3,
          emails_archived = $4,
          emails_marked_read = $5,
          emails_labeled = $6,
          emails_replied = $7,
          emails_forwarded = $8,
          tasks_created = $9,
          summary = $10,
          details = $11,
          completed_at = NOW()
        WHERE id = $1`,
        [
          id,
          filteredEmails.length,
          matched.length,
          counters.archived,
          counters.marked_read,
          counters.labeled,
          counters.replied,
          counters.forwarded,
          counters.tasks_created,
          summary,
          JSON.stringify(allDecisions),
        ],
      );

      logger.info({ runId: id, summary }, 'Email maintenance run completed');
      return id;
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      logger.error({ err, runId: id }, 'Email maintenance run failed');

      try {
        await this.pool.query(
          `UPDATE email_maintenance_runs SET status = 'failed', error = $2, completed_at = NOW() WHERE id = $1`,
          [id, errorMsg],
        );
      } catch (dbErr) {
        logger.error({ dbErr }, 'Failed to update run record with error');
      }

      return id;
    } finally {
      this.running = false;
    }
  }

  async getRunHistory(limit: number = 10, offset: number = 0): Promise<{ runs: RunRecord[]; total: number }> {
    const countResult = await this.pool.query('SELECT COUNT(*) FROM email_maintenance_runs');
    const total = parseInt(countResult.rows[0].count, 10);

    const result = await this.pool.query(
      'SELECT * FROM email_maintenance_runs ORDER BY started_at DESC LIMIT $1 OFFSET $2',
      [limit, offset],
    );

    return { runs: result.rows, total };
  }

  async getLatestRun(): Promise<RunRecord | null> {
    const result = await this.pool.query(
      'SELECT * FROM email_maintenance_runs ORDER BY started_at DESC LIMIT 1',
    );
    return result.rows[0] ?? null;
  }

  private async createRunRecord(id: string, config: EmailMaintenanceConfig, dryRun: boolean): Promise<void> {
    await this.pool.query(
      `INSERT INTO email_maintenance_runs (id, status, dry_run, goal, model)
       VALUES ($1, 'running', $2, $3, $4)`,
      [id, dryRun, config.goal, config.model],
    );
  }

  private isWithinRunWindow(config: EmailMaintenanceConfig): boolean {
    if (!config.run_window_start && !config.run_window_end) return true;

    const now = new Date();
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: this.timezone,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
    const currentTime = formatter.format(now);

    if (config.run_window_start && currentTime < config.run_window_start) return false;
    if (config.run_window_end && currentTime > config.run_window_end) return false;

    return true;
  }

  private async fetchEmails(config: EmailMaintenanceConfig): Promise<Array<{ id: string; subject: string; from: string; date: string; body: string }>> {
    // Build Gmail query
    const queryParts: string[] = [];
    if (config.gmail_query) queryParts.push(config.gmail_query);
    if (config.only_unread) queryParts.push('is:unread');

    const afterEpoch = Math.floor((Date.now() - LOOKBACK_MS[config.lookback_window]) / 1000);
    queryParts.push(`after:${afterEpoch}`);

    if (config.scan_labels.length > 0) {
      for (const label of config.scan_labels) {
        queryParts.push(`in:${label}`);
      }
    } else {
      queryParts.push('in:inbox');
    }

    const query = queryParts.join(' ');
    logger.info({ query, maxResults: config.max_emails_per_run }, 'Fetching emails');

    // List messages
    let listResult: any;
    try {
      listResult = await this.mcpManager.callTool('google', 'gmail_users_messages_list', {
        userId: 'me',
        q: query,
        maxResults: config.max_emails_per_run,
      });
    } catch (err) {
      logger.error({ err }, 'Failed to list Gmail messages');
      return [];
    }

    // Parse message IDs from list result
    const messages = this.extractMessages(listResult);
    if (messages.length === 0) return [];

    // Fetch each message
    const emails: Array<{ id: string; subject: string; from: string; date: string; body: string }> = [];
    for (const msg of messages) {
      try {
        const detail = await this.mcpManager.callTool('google', 'gmail_users_messages_get', {
          userId: 'me',
          id: msg.id,
        });

        const parsed = this.parseEmailDetail(detail, config.snippet_length);
        if (parsed) emails.push(parsed);

        // 100ms delay between fetches to avoid rate limits
        await new Promise(resolve => setTimeout(resolve, 100));
      } catch (err) {
        logger.warn({ err, messageId: msg.id }, 'Failed to fetch email detail');
      }
    }

    return emails;
  }

  private extractMessages(listResult: unknown): Array<{ id: string }> {
    if (!listResult) return [];

    // MCP results come back in various formats
    const data = typeof listResult === 'string' ? this.tryParse(listResult) : listResult;

    if (data && typeof data === 'object') {
      // Handle { content: [{ text: '...' }] } MCP response format
      const content = (data as any).content;
      if (Array.isArray(content)) {
        for (const item of content) {
          if (item.type === 'text' && item.text) {
            const parsed = this.tryParse(item.text);
            if (parsed?.messages) return parsed.messages;
            if (Array.isArray(parsed)) return parsed;
          }
        }
      }

      // Direct format
      if ((data as any).messages) return (data as any).messages;
      if (Array.isArray(data)) return data as Array<{ id: string }>;
    }

    return [];
  }

  private parseEmailDetail(detail: unknown, snippetLength: number): { id: string; subject: string; from: string; date: string; body: string } | null {
    const data = typeof detail === 'string' ? this.tryParse(detail) : detail;
    if (!data || typeof data !== 'object') return null;

    // Handle MCP content wrapper
    let emailData: any = data;
    const content = (data as any).content;
    if (Array.isArray(content)) {
      for (const item of content) {
        if (item.type === 'text' && item.text) {
          const parsed = this.tryParse(item.text);
          if (parsed) { emailData = parsed; break; }
        }
      }
    }

    const id = emailData.id ?? '';
    const headers = emailData.payload?.headers ?? [];
    const getHeader = (name: string) => headers.find((h: any) => h.name?.toLowerCase() === name.toLowerCase())?.value ?? '';

    const subject = getHeader('Subject') || emailData.snippet || '(no subject)';
    const from = getHeader('From') || '';
    const date = getHeader('Date') || '';

    // Extract body text
    let body = emailData.snippet ?? '';
    const payload = emailData.payload;
    if (payload) {
      const textBody = this.extractBodyText(payload);
      if (textBody) body = textBody;
    }

    // Truncate to snippet length
    if (body.length > snippetLength) {
      body = body.slice(0, snippetLength) + '...';
    }

    return { id, subject, from, date, body };
  }

  private extractBodyText(payload: any): string {
    // Check direct body
    if (payload.body?.data) {
      return Buffer.from(payload.body.data, 'base64url').toString('utf-8');
    }

    // Check parts recursively
    if (payload.parts) {
      for (const part of payload.parts) {
        if (part.mimeType === 'text/plain' && part.body?.data) {
          return Buffer.from(part.body.data, 'base64url').toString('utf-8');
        }
        if (part.parts) {
          const nested = this.extractBodyText(part);
          if (nested) return nested;
        }
      }
    }

    return '';
  }

  private privacyScrub(
    emails: Array<{ id: string; subject: string; from: string; date: string; body: string }>,
    keywords: string[],
  ): typeof emails {
    if (keywords.length === 0) return emails;

    const lowerKeywords = keywords.map(k => k.toLowerCase());
    return emails.filter(email => {
      const text = `${email.subject} ${email.body}`.toLowerCase();
      return !lowerKeywords.some(kw => text.includes(kw));
    });
  }

  private async analyzeEmails(
    emails: Array<{ id: string; subject: string; from: string; date: string; body: string }>,
    config: EmailMaintenanceConfig,
    calendarContext: string,
  ): Promise<EmailDetail[]> {
    if (emails.length === 0) return [];

    const enabledActions: string[] = [];
    if (config.mark_read) enabledActions.push('mark_read');
    if (config.archive) enabledActions.push('archive');
    if (config.apply_label) enabledActions.push('apply_label');
    if (config.auto_tasking) enabledActions.push('create_task');
    if (config.reply_enabled) enabledActions.push(`reply (mode: ${config.reply_mode})`);
    if (config.forward_to) enabledActions.push('forward');

    const emailList = emails.map((email, idx) =>
      `[${idx}] Subject: ${email.subject}\nFrom: ${email.from}\nDate: ${email.date}\nBody: ${email.body}\n`,
    ).join('\n---\n');

    const prompt = `You are an email analysis assistant. Analyze each email against the user's goal and decide what actions to take.

## User Goal
${config.goal}

## Next Steps / Instructions
${config.next_steps}

## Available Actions (only suggest enabled ones)
${enabledActions.length > 0 ? enabledActions.join(', ') : 'No write actions enabled — analysis only'}

${calendarContext ? `## Calendar Openings (next 5 business days)\n${calendarContext}\n` : ''}

## Emails to Analyze
${emailList}

## Instructions
For each email, determine if it matches the user's goal. Return a JSON array with one entry per email:

\`\`\`json
[
  {
    "email_index": 0,
    "subject": "...",
    "matches_goal": true,
    "reason": "Brief explanation of why this matches or doesn't",
    "actions": ["mark_read", "archive"],
    "reply": { "body": "Reply text..." } or null,
    "forward": false,
    "task": { "title": "...", "notes": "...", "due": "YYYY-MM-DD" } or null
  }
]
\`\`\`

Only include actions from the enabled list. If no actions match, use an empty actions array.
Return ONLY the JSON array, no other text.`;

    try {
      const result = await this.callClaude(config.model, prompt);
      const cleaned = this.stripCodeFences(result);
      const parsed = JSON.parse(cleaned);

      if (!Array.isArray(parsed)) return [];

      // Attach message IDs from the original emails
      return parsed.map((decision: any) => ({
        ...decision,
        message_id: emails[decision.email_index]?.id ?? '',
      }));
    } catch (err) {
      logger.error({ err }, 'Failed to analyze emails with Claude');
      return [];
    }
  }

  private async fetchCalendarOpenings(): Promise<string> {
    try {
      const now = new Date();
      const fiveDaysOut = new Date(now.getTime() + 5 * 24 * 60 * 60 * 1000);

      const result = await this.mcpManager.callTool('google', 'calendar_events_list', {
        calendarId: 'primary',
        timeMin: now.toISOString(),
        timeMax: fiveDaysOut.toISOString(),
        singleEvents: true,
        orderBy: 'startTime',
        maxResults: 50,
      });

      const data = typeof result === 'string' ? this.tryParse(result) : result;
      if (!data) return 'Unable to fetch calendar events.';

      // Parse events from MCP response
      let events: any[] = [];
      const content = (data as any).content;
      if (Array.isArray(content)) {
        for (const item of content) {
          if (item.type === 'text' && item.text) {
            const parsed = this.tryParse(item.text);
            if (parsed?.items) { events = parsed.items; break; }
          }
        }
      } else if ((data as any).items) {
        events = (data as any).items;
      }

      if (events.length === 0) return 'Calendar is open for the next 5 business days.';

      const eventLines = events.map((e: any) => {
        const start = e.start?.dateTime || e.start?.date || '';
        const end = e.end?.dateTime || e.end?.date || '';
        return `- ${e.summary ?? 'Busy'}: ${start} to ${end}`;
      });

      return `Existing events:\n${eventLines.join('\n')}\n\nSuggest times that don't conflict with these events.`;
    } catch (err) {
      logger.warn({ err }, 'Failed to fetch calendar openings');
      return 'Unable to check calendar availability.';
    }
  }

  private async executeActions(
    decision: EmailDetail,
    config: EmailMaintenanceConfig,
    counters: { archived: number; marked_read: number; labeled: number; replied: number; forwarded: number; tasks_created: number },
  ): Promise<void> {
    const actions = decision.actions ?? [];

    // Mark as read
    if (actions.includes('mark_read') && config.mark_read) {
      try {
        await this.mcpManager.callTool('google', 'gmail_users_messages_modify', {
          userId: 'me',
          id: decision.message_id,
          removeLabelIds: ['UNREAD'],
        });
        counters.marked_read++;
      } catch (err) {
        logger.warn({ err, messageId: decision.message_id }, 'Failed to mark email as read');
      }
    }

    // Archive
    if (actions.includes('archive') && config.archive) {
      try {
        await this.mcpManager.callTool('google', 'gmail_users_messages_modify', {
          userId: 'me',
          id: decision.message_id,
          removeLabelIds: ['INBOX'],
        });
        counters.archived++;
      } catch (err) {
        logger.warn({ err, messageId: decision.message_id }, 'Failed to archive email');
      }
    }

    // Apply label
    if (actions.includes('apply_label') && config.apply_label) {
      try {
        await this.mcpManager.callTool('google', 'gmail_users_messages_modify', {
          userId: 'me',
          id: decision.message_id,
          addLabelIds: [config.apply_label],
        });
        counters.labeled++;
      } catch (err) {
        logger.warn({ err, messageId: decision.message_id }, 'Failed to apply label');
      }
    }

    // Reply
    if (decision.reply?.body && config.reply_enabled) {
      try {
        if (config.reply_mode === 'draft') {
          await this.mcpManager.callTool('google', 'gmail_users_drafts_create', {
            userId: 'me',
            message: {
              threadId: decision.message_id,
              raw: this.buildReplyRaw(decision.from, decision.subject, decision.reply.body),
            },
          });
        } else {
          await this.mcpManager.callTool('google', 'gmail_users_messages_send', {
            userId: 'me',
            message: {
              threadId: decision.message_id,
              raw: this.buildReplyRaw(decision.from, decision.subject, decision.reply.body),
            },
          });
        }
        counters.replied++;
      } catch (err) {
        logger.warn({ err, messageId: decision.message_id }, 'Failed to create reply');
      }
    }

    // Forward
    if (decision.forward && config.forward_to) {
      try {
        await this.mcpManager.callTool('google', 'gmail_users_messages_send', {
          userId: 'me',
          message: {
            raw: this.buildForwardRaw(config.forward_to, decision.subject, decision.from),
          },
        });
        counters.forwarded++;
      } catch (err) {
        logger.warn({ err, messageId: decision.message_id }, 'Failed to forward email');
      }
    }

    // Create task
    if (decision.task && config.auto_tasking) {
      try {
        await this.mcpManager.callTool('google', 'tasks_tasks_insert', {
          tasklist: config.task_list,
          title: decision.task.title,
          notes: decision.task.notes,
          due: decision.task.due ? new Date(decision.task.due).toISOString() : undefined,
        });
        counters.tasks_created++;
      } catch (err) {
        logger.warn({ err, messageId: decision.message_id }, 'Failed to create task');
      }
    }
  }

  private buildReplyRaw(to: string, subject: string, body: string): string {
    const replySubject = subject.startsWith('Re:') ? subject : `Re: ${subject}`;
    const raw = `To: ${to}\r\nSubject: ${replySubject}\r\nContent-Type: text/plain; charset=utf-8\r\n\r\n${body}`;
    return Buffer.from(raw).toString('base64url');
  }

  private buildForwardRaw(to: string, subject: string, originalFrom: string): string {
    const fwdSubject = subject.startsWith('Fwd:') ? subject : `Fwd: ${subject}`;
    const body = `Forwarded from: ${originalFrom}\n\n(See original message in thread)`;
    const raw = `To: ${to}\r\nSubject: ${fwdSubject}\r\nContent-Type: text/plain; charset=utf-8\r\n\r\n${body}`;
    return Buffer.from(raw).toString('base64url');
  }

  private callClaude(model: string, prompt: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const proc = spawn('claude', [
        '-p',
        '--model', model,
        '--output-format', 'json',
      ], {
        stdio: ['pipe', 'pipe', 'pipe'],
        env: { ...process.env },
      });

      let stdout = '';
      let stderr = '';

      proc.stdout.on('data', (data: Buffer) => { stdout += data.toString(); });
      proc.stderr.on('data', (data: Buffer) => { stderr += data.toString(); });

      proc.on('close', (code) => {
        if (code !== 0) {
          reject(new Error(`Claude CLI exited with code ${code}: ${stderr}`));
        } else {
          try {
            const parsed = JSON.parse(stdout);
            resolve(parsed.result ?? stdout);
          } catch {
            resolve(stdout);
          }
        }
      });

      proc.on('error', (err) => {
        reject(new Error(`Failed to spawn Claude CLI: ${err.message}`));
      });

      proc.stdin.write(prompt);
      proc.stdin.end();
    });
  }

  private stripCodeFences(text: string): string {
    const trimmed = text.trim();
    const match = trimmed.match(/^```(?:json)?\s*\n([\s\S]*?)\n```$/);
    return match ? match[1].trim() : trimmed;
  }

  private tryParse(text: string): any {
    try {
      return JSON.parse(text);
    } catch {
      return null;
    }
  }

  private cadenceToMs(cadence: string): number {
    switch (cadence) {
      case '15m': return 15 * 60 * 1000;
      case '30m': return 30 * 60 * 1000;
      case '1h': return 60 * 60 * 1000;
      case '6h': return 6 * 60 * 60 * 1000;
      case 'daily': return 24 * 60 * 60 * 1000;
      default: return 60 * 60 * 1000;
    }
  }
}
