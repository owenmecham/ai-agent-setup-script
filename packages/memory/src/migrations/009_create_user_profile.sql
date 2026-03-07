CREATE TABLE IF NOT EXISTS user_profile (
  id TEXT PRIMARY KEY DEFAULT 'default',
  name TEXT,
  location TEXT,
  profession TEXT,
  hobbies TEXT[],
  social_twitter TEXT,
  social_linkedin TEXT,
  social_github TEXT,
  social_instagram TEXT,
  social_facebook TEXT,
  bio TEXT,
  preferences JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
