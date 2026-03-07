import Database from 'better-sqlite3';

export interface ChatDbRow {
  rowid: number;
  text: string | null;
  attributedBody: Buffer | null;
  cache_has_attachments: number;
  associated_message_type: number;
  is_from_me: number;
  sender: string | null;
  chat_guid: string | null;
  attachment_paths: string | null;
  attachment_mimes: string | null;
  attachment_names: string | null;
}

export class ChatDb {
  private db: Database.Database | null = null;

  open(path: string): void {
    const resolved = path.replace(/^~/, process.env.HOME ?? '');
    this.db = new Database(resolved, { readonly: true });
    // Enable WAL mode reading for better concurrency with Messages.app
    this.db.pragma('journal_mode = WAL');
  }

  getMaxRowId(): number {
    this.ensureOpen();
    const row = this.db!.prepare('SELECT MAX(rowid) AS maxId FROM message').get() as
      | { maxId: number | null }
      | undefined;
    return row?.maxId ?? 0;
  }

  fetchNewMessages(sinceRowId: number): ChatDbRow[] {
    this.ensureOpen();
    const stmt = this.db!.prepare(`
      SELECT m.rowid, m.text, m.attributedBody,
             m.cache_has_attachments, m.associated_message_type,
             m.is_from_me,
             h.id AS sender, c.guid AS chat_guid,
             GROUP_CONCAT(a.filename, '||') AS attachment_paths,
             GROUP_CONCAT(a.mime_type, '||') AS attachment_mimes,
             GROUP_CONCAT(a.transfer_name, '||') AS attachment_names
      FROM message m
      LEFT JOIN handle h ON m.handle_id = h.rowid
      LEFT JOIN chat_message_join cmj ON m.rowid = cmj.message_id
      LEFT JOIN chat c ON cmj.chat_id = c.rowid
      LEFT JOIN message_attachment_join maj ON m.rowid = maj.message_id
      LEFT JOIN attachment a ON a.rowid = maj.attachment_id
      WHERE m.rowid > ?
      GROUP BY m.rowid
      ORDER BY m.rowid ASC
    `);
    return stmt.all(sinceRowId) as ChatDbRow[];
  }

  close(): void {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }

  private ensureOpen(): void {
    if (!this.db) {
      throw new Error('ChatDb is not open. Call open() first.');
    }
  }
}
