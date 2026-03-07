CREATE TABLE IF NOT EXISTS outbound_grants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient TEXT NOT NULL,
  outbound_message TEXT NOT NULL,
  conversation_id TEXT,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_outbound_grants_recipient_expires
  ON outbound_grants (recipient, expires_at);
CREATE INDEX IF NOT EXISTS idx_outbound_grants_expires
  ON outbound_grants (expires_at);
