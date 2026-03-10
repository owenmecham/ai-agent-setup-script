import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, dirname } from 'node:path';
import { OAuth2Client } from 'google-auth-library';
import { google, type gmail_v1, type calendar_v3, type tasks_v1, type drive_v3 } from 'googleapis';
import type {
  GmailMessageDetail,
  GmailLabel,
  CalendarEvent,
  CalendarEventInput,
  TaskList,
  Task,
  TaskInput,
  DriveFile,
  GoogleClientConfig,
  GoogleService,
} from './types.js';

export const GOOGLE_SCOPES = [
  'https://www.googleapis.com/auth/gmail.modify',
  'https://www.googleapis.com/auth/gmail.compose',
  'https://www.googleapis.com/auth/gmail.labels',
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/calendar',
  'https://www.googleapis.com/auth/drive.readonly',
  'https://www.googleapis.com/auth/tasks',
];

const DEFAULT_CONFIG_DIR = join(homedir(), '.config', 'murph', 'google');
const DEFAULT_CREDENTIALS_PATH = join(DEFAULT_CONFIG_DIR, 'client_secret.json');
const DEFAULT_TOKEN_PATH = join(DEFAULT_CONFIG_DIR, 'token.json');

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 1000;

export class GoogleApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = 'GoogleApiError';
    this.status = status;
  }
}

export class GoogleAuthError extends GoogleApiError {
  constructor(message: string) {
    super(message, 401);
    this.name = 'GoogleAuthError';
  }
}

export class GoogleClient implements GoogleService {
  private auth: OAuth2Client | null = null;
  private credentialsPath: string;
  private tokenPath: string;
  private _gmail: gmail_v1.Gmail | null = null;
  private _calendar: calendar_v3.Calendar | null = null;
  private _tasks: tasks_v1.Tasks | null = null;
  private _drive: drive_v3.Drive | null = null;

  constructor(config?: Partial<GoogleClientConfig>) {
    this.credentialsPath = config?.credentialsPath ?? DEFAULT_CREDENTIALS_PATH;
    this.tokenPath = config?.tokenPath ?? DEFAULT_TOKEN_PATH;
  }

  async init(): Promise<void> {
    if (!existsSync(this.credentialsPath)) {
      throw new GoogleAuthError(
        `Credentials not found at ${this.credentialsPath}. ` +
        'Download client_secret.json from Google Cloud Console and place it there.',
      );
    }

    const content = await readFile(this.credentialsPath, 'utf-8');
    const credentials = JSON.parse(content);
    const key = credentials.installed ?? credentials.web;
    if (!key) {
      throw new GoogleAuthError('Invalid client_secret.json — expected "installed" or "web" key');
    }

    this.auth = new OAuth2Client(
      key.client_id,
      key.client_secret,
      key.redirect_uris?.[0] ?? 'http://localhost',
    );

    // Load existing token if available
    if (existsSync(this.tokenPath)) {
      const tokenContent = await readFile(this.tokenPath, 'utf-8');
      const tokens = JSON.parse(tokenContent);
      this.auth.setCredentials(tokens);
    }

    // Auto-persist refreshed tokens
    this.auth.on('tokens', async (tokens) => {
      try {
        // Merge with existing tokens (refresh_token may not be included on refresh)
        let existing: Record<string, unknown> = {};
        if (existsSync(this.tokenPath)) {
          existing = JSON.parse(await readFile(this.tokenPath, 'utf-8'));
        }
        const merged = { ...existing, ...tokens };
        await mkdir(dirname(this.tokenPath), { recursive: true });
        await writeFile(this.tokenPath, JSON.stringify(merged, null, 2));
      } catch {
        // Silently ignore write errors — token refresh still works in-memory
      }
    });

    // Reset cached service instances
    this._gmail = null;
    this._calendar = null;
    this._tasks = null;
    this._drive = null;
  }

  private get gmail(): gmail_v1.Gmail {
    if (!this._gmail) {
      this._gmail = google.gmail({ version: 'v1', auth: this.auth! });
    }
    return this._gmail;
  }

  private get calendar(): calendar_v3.Calendar {
    if (!this._calendar) {
      this._calendar = google.calendar({ version: 'v3', auth: this.auth! });
    }
    return this._calendar;
  }

  private get tasks(): tasks_v1.Tasks {
    if (!this._tasks) {
      this._tasks = google.tasks({ version: 'v1', auth: this.auth! });
    }
    return this._tasks;
  }

  private get drive(): drive_v3.Drive {
    if (!this._drive) {
      this._drive = google.drive({ version: 'v3', auth: this.auth! });
    }
    return this._drive;
  }

  private async apiCall<T>(fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (err: any) {
      const status = err?.response?.status ?? err?.code ?? 0;
      const message = err?.response?.data?.error?.message ?? err?.message ?? String(err);
      if (status === 401 || status === 403) {
        throw new GoogleAuthError(message);
      }
      throw new GoogleApiError(message, typeof status === 'number' ? status : 0);
    }
  }

  private async withRetry<T>(fn: () => Promise<T>): Promise<T> {
    let lastError: Error | null = null;
    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      try {
        return await this.apiCall(fn);
      } catch (err) {
        lastError = err as Error;
        if (err instanceof GoogleAuthError) throw err;
        const status = (err as GoogleApiError).status;
        if (status !== 429 && (status < 500 || status >= 600)) throw err;
        // Exponential backoff
        await new Promise(r => setTimeout(r, RETRY_DELAY_MS * Math.pow(2, attempt)));
      }
    }
    throw lastError!;
  }

  // ─── Static Auth Methods ────────────────────────────────────────────

  static async getAuthUrl(
    credentialsPath: string = DEFAULT_CREDENTIALS_PATH,
    scopes: string[] = GOOGLE_SCOPES,
    redirectUri: string = 'http://localhost:9876/callback',
  ): Promise<string> {
    const content = await readFile(credentialsPath, 'utf-8');
    const credentials = JSON.parse(content);
    const key = credentials.installed ?? credentials.web;
    const client = new OAuth2Client(key.client_id, key.client_secret, redirectUri);
    return client.generateAuthUrl({
      access_type: 'offline',
      scope: scopes,
      prompt: 'consent',
    });
  }

  static async exchangeCode(
    credentialsPath: string = DEFAULT_CREDENTIALS_PATH,
    tokenPath: string = DEFAULT_TOKEN_PATH,
    code: string,
    redirectUri: string = 'http://localhost:9876/callback',
  ): Promise<void> {
    const content = await readFile(credentialsPath, 'utf-8');
    const credentials = JSON.parse(content);
    const key = credentials.installed ?? credentials.web;
    const client = new OAuth2Client(key.client_id, key.client_secret, redirectUri);
    const { tokens } = await client.getToken(code);
    await mkdir(dirname(tokenPath), { recursive: true });
    await writeFile(tokenPath, JSON.stringify(tokens, null, 2));
  }

  // ─── Auth Check ─────────────────────────────────────────────────────

  async isAuthenticated(): Promise<boolean> {
    try {
      if (!this.auth) return false;
      const creds = this.auth.credentials;
      if (!creds || (!creds.access_token && !creds.refresh_token)) return false;
      await this.apiCall(() => this.gmail.users.getProfile({ userId: 'me' }));
      return true;
    } catch {
      return false;
    }
  }

  // ─── Gmail ──────────────────────────────────────────────────────────

  async searchEmails(
    query: string,
    maxResults: number = 50,
  ): Promise<Array<{ id: string; subject: string; from: string; date: string; body: string }>> {
    const listRes = await this.withRetry(() =>
      this.gmail.users.messages.list({
        userId: 'me',
        q: query,
        maxResults,
      }),
    );

    const messages = listRes.data.messages ?? [];
    if (messages.length === 0) return [];

    const results: Array<{ id: string; subject: string; from: string; date: string; body: string }> = [];
    for (const msg of messages) {
      if (!msg.id) continue;
      const detail = await this.getEmail(msg.id);
      if (detail) results.push(detail);
      await new Promise(r => setTimeout(r, 50));
    }

    return results;
  }

  async getEmail(messageId: string): Promise<GmailMessageDetail | null> {
    try {
      const res = await this.withRetry(() =>
        this.gmail.users.messages.get({
          userId: 'me',
          id: messageId,
          format: 'full',
        }),
      );

      const data = res.data;
      if (!data) return null;

      const headers = data.payload?.headers ?? [];
      const getHeader = (name: string) =>
        headers.find(h => h.name?.toLowerCase() === name.toLowerCase())?.value ?? '';

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
    await this.withRetry(() =>
      this.gmail.users.messages.modify({
        userId: 'me',
        id: messageId,
        requestBody: {
          addLabelIds: addLabels,
          removeLabelIds: removeLabels,
        },
      }),
    );
  }

  async archiveEmail(messageId: string): Promise<void> {
    await this.modifyEmail(messageId, undefined, ['INBOX']);
  }

  async sendEmail(to: string, subject: string, body: string, threadId?: string): Promise<void> {
    const raw = this.buildRawEmail(to, subject, body);
    await this.withRetry(() =>
      this.gmail.users.messages.send({
        userId: 'me',
        requestBody: {
          raw,
          threadId: threadId ?? undefined,
        },
      }),
    );
  }

  async createDraft(to: string, subject: string, body: string, threadId?: string): Promise<void> {
    const raw = this.buildRawEmail(to, subject, body);
    await this.withRetry(() =>
      this.gmail.users.drafts.create({
        userId: 'me',
        requestBody: {
          message: {
            raw,
            threadId: threadId ?? undefined,
          },
        },
      }),
    );
  }

  async listLabels(): Promise<GmailLabel[]> {
    const res = await this.withRetry(() =>
      this.gmail.users.labels.list({ userId: 'me' }),
    );
    return (res.data.labels ?? []).map(l => ({
      id: l.id ?? '',
      name: l.name ?? '',
      type: l.type ?? '',
    }));
  }

  async createLabel(name: string): Promise<GmailLabel> {
    const res = await this.withRetry(() =>
      this.gmail.users.labels.create({
        userId: 'me',
        requestBody: {
          name,
          labelListVisibility: 'labelShow',
          messageListVisibility: 'show',
        },
      }),
    );
    return {
      id: res.data.id ?? '',
      name: res.data.name ?? name,
      type: res.data.type ?? 'user',
    };
  }

  // ─── Calendar ───────────────────────────────────────────────────────

  async listCalendarEvents(timeMin: string, timeMax: string): Promise<CalendarEvent[]> {
    const res = await this.withRetry(() =>
      this.calendar.events.list({
        calendarId: 'primary',
        timeMin,
        timeMax,
        singleEvents: true,
        orderBy: 'startTime',
        maxResults: 50,
      }),
    );
    return (res.data.items ?? []).map(e => ({
      id: e.id ?? '',
      summary: e.summary ?? '',
      description: e.description ?? undefined,
      start: {
        dateTime: e.start?.dateTime ?? undefined,
        date: e.start?.date ?? undefined,
      },
      end: {
        dateTime: e.end?.dateTime ?? undefined,
        date: e.end?.date ?? undefined,
      },
      location: e.location ?? undefined,
      status: e.status ?? undefined,
    }));
  }

  async createCalendarEvent(event: CalendarEventInput): Promise<CalendarEvent> {
    const res = await this.withRetry(() =>
      this.calendar.events.insert({
        calendarId: 'primary',
        requestBody: {
          summary: event.summary,
          description: event.description,
          location: event.location,
          start: event.start,
          end: event.end,
          attendees: event.attendees,
        },
      }),
    );
    const e = res.data;
    return {
      id: e.id ?? '',
      summary: e.summary ?? '',
      description: e.description ?? undefined,
      start: {
        dateTime: e.start?.dateTime ?? undefined,
        date: e.start?.date ?? undefined,
      },
      end: {
        dateTime: e.end?.dateTime ?? undefined,
        date: e.end?.date ?? undefined,
      },
      location: e.location ?? undefined,
      status: e.status ?? undefined,
    };
  }

  // ─── Tasks ──────────────────────────────────────────────────────────

  async listTaskLists(): Promise<TaskList[]> {
    const res = await this.withRetry(() =>
      this.tasks.tasklists.list(),
    );
    return (res.data.items ?? []).map(t => ({
      id: t.id ?? '',
      title: t.title ?? '',
    }));
  }

  async listTasks(taskListId: string): Promise<Task[]> {
    const res = await this.withRetry(() =>
      this.tasks.tasks.list({ tasklist: taskListId }),
    );
    return (res.data.items ?? []).map(t => ({
      id: t.id ?? '',
      title: t.title ?? '',
      notes: t.notes ?? undefined,
      due: t.due ?? undefined,
      status: (t.status as 'needsAction' | 'completed') ?? 'needsAction',
    }));
  }

  async createTask(taskListId: string, task: TaskInput): Promise<Task> {
    const res = await this.withRetry(() =>
      this.tasks.tasks.insert({
        tasklist: taskListId,
        requestBody: {
          title: task.title,
          notes: task.notes,
          due: task.due,
        },
      }),
    );
    const t = res.data;
    return {
      id: t.id ?? '',
      title: t.title ?? '',
      notes: t.notes ?? undefined,
      due: t.due ?? undefined,
      status: (t.status as 'needsAction' | 'completed') ?? 'needsAction',
    };
  }

  async updateTask(taskListId: string, taskId: string, updates: Partial<TaskInput> & { status?: string }): Promise<Task> {
    const res = await this.withRetry(() =>
      this.tasks.tasks.patch({
        tasklist: taskListId,
        task: taskId,
        requestBody: {
          title: updates.title,
          notes: updates.notes,
          due: updates.due,
          status: updates.status,
        },
      }),
    );
    const t = res.data;
    return {
      id: t.id ?? '',
      title: t.title ?? '',
      notes: t.notes ?? undefined,
      due: t.due ?? undefined,
      status: (t.status as 'needsAction' | 'completed') ?? 'needsAction',
    };
  }

  async completeTask(taskListId: string, taskId: string): Promise<Task> {
    return this.updateTask(taskListId, taskId, { status: 'completed' });
  }

  // ─── Drive (read-only) ─────────────────────────────────────────────

  async listDriveFiles(query?: string, maxResults: number = 20): Promise<DriveFile[]> {
    const res = await this.withRetry(() =>
      this.drive.files.list({
        q: query ?? undefined,
        pageSize: maxResults,
        fields: 'files(id,name,mimeType,modifiedTime,size)',
      }),
    );
    return (res.data.files ?? []).map(f => ({
      id: f.id ?? '',
      name: f.name ?? '',
      mimeType: f.mimeType ?? '',
      modifiedTime: f.modifiedTime ?? undefined,
      size: f.size ?? undefined,
    }));
  }

  async getDriveFile(fileId: string): Promise<DriveFile> {
    const res = await this.withRetry(() =>
      this.drive.files.get({
        fileId,
        fields: 'id,name,mimeType,modifiedTime,size',
      }),
    );
    const f = res.data;
    return {
      id: f.id ?? '',
      name: f.name ?? '',
      mimeType: f.mimeType ?? '',
      modifiedTime: f.modifiedTime ?? undefined,
      size: f.size ?? undefined,
    };
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

  private buildRawEmail(to: string, subject: string, body: string): string {
    const raw = `To: ${to}\r\nSubject: ${subject}\r\nContent-Type: text/plain; charset=utf-8\r\n\r\n${body}`;
    return Buffer.from(raw).toString('base64url');
  }
}
