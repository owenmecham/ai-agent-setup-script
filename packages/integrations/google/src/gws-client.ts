import { spawn } from 'node:child_process';
import type {
  GmailMessage,
  GmailMessageDetail,
  GmailLabel,
  CalendarEvent,
  CalendarEventInput,
  TaskList,
  Task,
  TaskInput,
  DriveFile,
  DocContent,
  SheetData,
  GwsExecResult,
  GoogleService,
} from './types.js';

export class GwsClient implements GoogleService {
  private gwsBin: string;

  constructor(gwsBin: string = 'gws') {
    this.gwsBin = gwsBin;
  }

  /**
   * Execute a gws CLI command and return parsed JSON output.
   * Throws on non-zero exit code or JSON parse failure.
   */
  async exec(args: string[]): Promise<unknown> {
    const result = await this.execRaw(args);
    if (result.code !== 0) {
      const msg = result.stderr.trim() || result.stdout.trim() || `gws exited with code ${result.code}`;
      if (msg.includes('credentials') || msg.includes('auth') || msg.includes('token') || msg.includes('login')) {
        throw new GwsAuthError(msg);
      }
      throw new GwsError(msg, result.code);
    }

    const output = result.stdout.trim();
    if (!output) return {};

    try {
      return JSON.parse(output);
    } catch {
      // gws may return non-JSON for some commands — return as string wrapper
      return { raw: output };
    }
  }

  /** Execute a gws CLI command and return raw stdout/stderr/code. */
  private execRaw(args: string[]): Promise<GwsExecResult> {
    return new Promise((resolve) => {
      try {
        const proc = spawn(this.gwsBin, args, {
          stdio: ['pipe', 'pipe', 'pipe'],
          env: { ...process.env },
        });

        let stdout = '';
        let stderr = '';

        proc.stdout.on('data', (d: Buffer) => { stdout += d.toString(); });
        proc.stderr.on('data', (d: Buffer) => { stderr += d.toString(); });

        proc.on('close', (code) => {
          resolve({ stdout, stderr, code: code ?? 1 });
        });

        proc.on('error', (err) => {
          resolve({ stdout: '', stderr: err.message, code: 1 });
        });

        // Close stdin — gws doesn't read from it
        proc.stdin.end();
      } catch (err) {
        resolve({
          stdout: '',
          stderr: err instanceof Error ? err.message : String(err),
          code: 1,
        });
      }
    });
  }

  // ─── Auth ───────────────────────────────────────────────────────────

  async isAuthenticated(): Promise<boolean> {
    try {
      const result = await this.execRaw(['gmail', 'users.getProfile', '--user-id', 'me']);
      return result.code === 0;
    } catch {
      return false;
    }
  }

  // ─── Gmail ──────────────────────────────────────────────────────────

  async searchEmails(query: string, maxResults: number = 50): Promise<Array<{ id: string; subject: string; from: string; date: string; body: string }>> {
    const data = await this.exec([
      'gmail', 'users.messages.list',
      '--user-id', 'me',
      '--q', query,
      '--max-results', String(maxResults),
    ]) as any;

    const messages: GmailMessage[] = data?.messages ?? [];
    if (messages.length === 0) return [];

    const results: Array<{ id: string; subject: string; from: string; date: string; body: string }> = [];
    for (const msg of messages) {
      const detail = await this.getEmail(msg.id);
      if (detail) results.push(detail);
      // Small delay to avoid rate limits
      await new Promise(r => setTimeout(r, 50));
    }

    return results;
  }

  async getEmail(messageId: string): Promise<GmailMessageDetail | null> {
    try {
      const data = await this.exec([
        'gmail', 'users.messages.get',
        '--user-id', 'me',
        '--id', messageId,
        '--format', 'full',
      ]) as any;

      if (!data) return null;

      const headers = data.payload?.headers ?? [];
      const getHeader = (name: string) =>
        headers.find((h: any) => h.name?.toLowerCase() === name.toLowerCase())?.value ?? '';

      let body = data.snippet ?? '';
      if (data.payload) {
        const textBody = this.extractBodyText(data.payload);
        if (textBody) body = textBody;
      }

      return {
        id: data.id ?? messageId,
        threadId: data.threadId ?? '',
        subject: getHeader('Subject') || data.snippet || '(no subject)',
        from: getHeader('From'),
        to: getHeader('To'),
        date: getHeader('Date'),
        body,
        snippet: data.snippet ?? '',
        labelIds: data.labelIds ?? [],
      };
    } catch {
      return null;
    }
  }

  async modifyEmail(messageId: string, addLabels?: string[], removeLabels?: string[]): Promise<void> {
    const args = ['gmail', 'users.messages.modify', '--user-id', 'me', '--id', messageId];
    if (addLabels?.length) {
      args.push('--add-label-ids', addLabels.join(','));
    }
    if (removeLabels?.length) {
      args.push('--remove-label-ids', removeLabels.join(','));
    }
    await this.exec(args);
  }

  async archiveEmail(messageId: string): Promise<void> {
    await this.modifyEmail(messageId, undefined, ['INBOX']);
  }

  async sendEmail(to: string, subject: string, body: string, threadId?: string): Promise<void> {
    const raw = this.buildRawEmail(to, subject, body, threadId);
    await this.exec([
      'gmail', 'users.messages.send',
      '--user-id', 'me',
      '--raw', raw,
    ]);
  }

  async createDraft(to: string, subject: string, body: string, threadId?: string): Promise<void> {
    const raw = this.buildRawEmail(to, subject, body, threadId);
    await this.exec([
      'gmail', 'users.drafts.create',
      '--user-id', 'me',
      '--message.raw', raw,
      ...(threadId ? ['--message.thread-id', threadId] : []),
    ]);
  }

  async listLabels(): Promise<GmailLabel[]> {
    const data = await this.exec([
      'gmail', 'users.labels.list',
      '--user-id', 'me',
    ]) as any;
    return data?.labels ?? [];
  }

  async createLabel(name: string): Promise<GmailLabel> {
    const data = await this.exec([
      'gmail', 'users.labels.create',
      '--user-id', 'me',
      '--name', name,
      '--label-list-visibility', 'labelShow',
      '--message-list-visibility', 'show',
    ]) as any;
    return data;
  }

  // ─── Calendar ───────────────────────────────────────────────────────

  async listCalendarEvents(timeMin: string, timeMax: string): Promise<CalendarEvent[]> {
    const data = await this.exec([
      'calendar', 'events.list',
      '--calendar-id', 'primary',
      '--time-min', timeMin,
      '--time-max', timeMax,
      '--single-events', 'true',
      '--order-by', 'startTime',
      '--max-results', '50',
    ]) as any;
    return data?.items ?? [];
  }

  async createCalendarEvent(event: CalendarEventInput): Promise<CalendarEvent> {
    const args = [
      'calendar', 'events.insert',
      '--calendar-id', 'primary',
      '--summary', event.summary,
    ];
    if (event.description) args.push('--description', event.description);
    if (event.location) args.push('--location', event.location);
    if (event.start.dateTime) {
      args.push('--start.date-time', event.start.dateTime);
      if (event.start.timeZone) args.push('--start.time-zone', event.start.timeZone);
    } else if (event.start.date) {
      args.push('--start.date', event.start.date);
    }
    if (event.end.dateTime) {
      args.push('--end.date-time', event.end.dateTime);
      if (event.end.timeZone) args.push('--end.time-zone', event.end.timeZone);
    } else if (event.end.date) {
      args.push('--end.date', event.end.date);
    }

    const data = await this.exec(args) as any;
    return data;
  }

  // ─── Tasks ──────────────────────────────────────────────────────────

  async listTaskLists(): Promise<TaskList[]> {
    const data = await this.exec(['tasks', 'tasklists.list']) as any;
    return data?.items ?? [];
  }

  async listTasks(taskListId: string): Promise<Task[]> {
    const data = await this.exec([
      'tasks', 'tasks.list',
      '--tasklist', taskListId,
    ]) as any;
    return data?.items ?? [];
  }

  async createTask(taskListId: string, task: TaskInput): Promise<Task> {
    const args = [
      'tasks', 'tasks.insert',
      '--tasklist', taskListId,
      '--title', task.title,
    ];
    if (task.notes) args.push('--notes', task.notes);
    if (task.due) args.push('--due', task.due);
    const data = await this.exec(args) as any;
    return data;
  }

  async updateTask(taskListId: string, taskId: string, updates: Partial<TaskInput> & { status?: string }): Promise<Task> {
    const args = [
      'tasks', 'tasks.patch',
      '--tasklist', taskListId,
      '--task', taskId,
    ];
    if (updates.title) args.push('--title', updates.title);
    if (updates.notes) args.push('--notes', updates.notes);
    if (updates.due) args.push('--due', updates.due);
    if (updates.status) args.push('--status', updates.status);
    const data = await this.exec(args) as any;
    return data;
  }

  async completeTask(taskListId: string, taskId: string): Promise<Task> {
    return this.updateTask(taskListId, taskId, { status: 'completed' });
  }

  // ─── Drive ──────────────────────────────────────────────────────────

  async listDriveFiles(query?: string, maxResults: number = 20): Promise<DriveFile[]> {
    const args = [
      'drive', 'files.list',
      '--max-results', String(maxResults),
    ];
    if (query) args.push('--q', query);
    const data = await this.exec(args) as any;
    return data?.files ?? [];
  }

  async getDriveFile(fileId: string): Promise<DriveFile> {
    const data = await this.exec([
      'drive', 'files.get',
      '--file-id', fileId,
    ]) as any;
    return data;
  }

  async createDriveFile(name: string, mimeType: string, content?: string): Promise<DriveFile> {
    const args = [
      'drive', 'files.create',
      '--name', name,
      '--mime-type', mimeType,
    ];
    const data = await this.exec(args) as any;
    return data;
  }

  // ─── Docs ───────────────────────────────────────────────────────────

  async getDoc(documentId: string): Promise<DocContent> {
    const data = await this.exec([
      'docs', 'documents.get',
      '--document-id', documentId,
    ]) as any;
    return {
      documentId: data.documentId ?? documentId,
      title: data.title ?? '',
      body: JSON.stringify(data.body ?? {}),
    };
  }

  async createDoc(title: string): Promise<DocContent> {
    const data = await this.exec([
      'docs', 'documents.create',
      '--title', title,
    ]) as any;
    return {
      documentId: data.documentId ?? '',
      title: data.title ?? title,
      body: '',
    };
  }

  // ─── Sheets ─────────────────────────────────────────────────────────

  async getSheetValues(spreadsheetId: string, range: string): Promise<SheetData> {
    const data = await this.exec([
      'sheets', 'spreadsheets.values.get',
      '--spreadsheet-id', spreadsheetId,
      '--range', range,
    ]) as any;
    return {
      spreadsheetId,
      title: '',
      values: data?.values ?? [],
    };
  }

  async createSpreadsheet(title: string): Promise<SheetData> {
    const data = await this.exec([
      'sheets', 'spreadsheets.create',
      '--properties.title', title,
    ]) as any;
    return {
      spreadsheetId: data?.spreadsheetId ?? '',
      title,
      values: [],
    };
  }

  async updateSheetValues(spreadsheetId: string, range: string, values: unknown[][]): Promise<void> {
    await this.exec([
      'sheets', 'spreadsheets.values.update',
      '--spreadsheet-id', spreadsheetId,
      '--range', range,
      '--value-input-option', 'USER_ENTERED',
      '--values', JSON.stringify(values),
    ]);
  }

  // ─── Chat ───────────────────────────────────────────────────────────

  async sendChatMessage(spaceName: string, text: string): Promise<void> {
    await this.exec([
      'chat', 'spaces.messages.create',
      '--parent', spaceName,
      '--text', text,
    ]);
  }

  // ─── Helpers ────────────────────────────────────────────────────────

  private extractBodyText(payload: any): string {
    if (payload.body?.data) {
      return Buffer.from(payload.body.data, 'base64url').toString('utf-8');
    }
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

  private buildRawEmail(to: string, subject: string, body: string, threadId?: string): string {
    const raw = `To: ${to}\r\nSubject: ${subject}\r\nContent-Type: text/plain; charset=utf-8\r\n\r\n${body}`;
    return Buffer.from(raw).toString('base64url');
  }
}

export class GwsError extends Error {
  code: number;
  constructor(message: string, code: number) {
    super(message);
    this.name = 'GwsError';
    this.code = code;
  }
}

export class GwsAuthError extends GwsError {
  constructor(message: string) {
    super(message, 1);
    this.name = 'GwsAuthError';
  }
}
