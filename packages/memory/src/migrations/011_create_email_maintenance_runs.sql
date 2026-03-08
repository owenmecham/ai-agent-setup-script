CREATE TABLE IF NOT EXISTS email_maintenance_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  status TEXT NOT NULL DEFAULT 'running',
  dry_run BOOLEAN NOT NULL DEFAULT FALSE,
  goal TEXT,
  model TEXT,
  emails_scanned INTEGER DEFAULT 0,
  emails_matched INTEGER DEFAULT 0,
  emails_archived INTEGER DEFAULT 0,
  emails_marked_read INTEGER DEFAULT 0,
  emails_labeled INTEGER DEFAULT 0,
  emails_replied INTEGER DEFAULT 0,
  emails_forwarded INTEGER DEFAULT 0,
  tasks_created INTEGER DEFAULT 0,
  summary TEXT,
  details JSONB DEFAULT '[]',
  error TEXT,
  started_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_em_runs_status ON email_maintenance_runs(status);
CREATE INDEX IF NOT EXISTS idx_em_runs_started ON email_maintenance_runs(started_at DESC);
