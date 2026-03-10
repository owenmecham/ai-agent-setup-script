export interface GmailMessage {
  id: string;
  threadId: string;
  snippet: string;
  labelIds: string[];
}

export interface GmailMessageDetail {
  id: string;
  threadId: string;
  subject: string;
  from: string;
  to: string;
  date: string;
  body: string;
  snippet: string;
  labelIds: string[];
}

export interface GmailLabel {
  id: string;
  name: string;
  type: string;
}

export interface CalendarEvent {
  id: string;
  summary: string;
  description?: string;
  start: { dateTime?: string; date?: string };
  end: { dateTime?: string; date?: string };
  location?: string;
  status?: string;
}

export interface CalendarEventInput {
  summary: string;
  description?: string;
  start: { dateTime?: string; date?: string; timeZone?: string };
  end: { dateTime?: string; date?: string; timeZone?: string };
  location?: string;
  attendees?: Array<{ email: string }>;
}

export interface TaskList {
  id: string;
  title: string;
}

export interface Task {
  id: string;
  title: string;
  notes?: string;
  due?: string;
  status: 'needsAction' | 'completed';
}

export interface TaskInput {
  title: string;
  notes?: string;
  due?: string;
}

export interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  modifiedTime?: string;
  size?: string;
}

export interface GoogleClientConfig {
  credentialsPath: string;
  tokenPath: string;
}

/** Interface for email-maintenance to consume Google services without knowing about implementation details. */
export interface GoogleService {
  searchEmails(query: string, maxResults: number): Promise<Array<{ id: string; subject: string; from: string; date: string; body: string }>>;
  getEmail(messageId: string): Promise<{ id: string; subject: string; from: string; to: string; date: string; body: string } | null>;
  modifyEmail(messageId: string, addLabels?: string[], removeLabels?: string[]): Promise<void>;
  archiveEmail(messageId: string): Promise<void>;
  sendEmail(to: string, subject: string, body: string, threadId?: string): Promise<void>;
  createDraft(to: string, subject: string, body: string, threadId?: string): Promise<void>;
  listLabels(): Promise<GmailLabel[]>;
  createLabel(name: string): Promise<GmailLabel>;
  listCalendarEvents(timeMin: string, timeMax: string): Promise<CalendarEvent[]>;
  createCalendarEvent(event: CalendarEventInput): Promise<CalendarEvent>;
  listTaskLists(): Promise<TaskList[]>;
  listTasks(taskListId: string): Promise<Task[]>;
  createTask(taskListId: string, task: TaskInput): Promise<Task>;
  updateTask(taskListId: string, taskId: string, updates: Partial<TaskInput> & { status?: string }): Promise<Task>;
  completeTask(taskListId: string, taskId: string): Promise<Task>;
  isAuthenticated(): Promise<boolean>;
}
