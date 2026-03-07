import pg from 'pg';

let pool: pg.Pool | null = null;

export function getPool(databaseUrl: string): pg.Pool {
  if (!pool) {
    pool = new pg.Pool({ connectionString: databaseUrl, max: 3 });
  }
  return pool;
}

export interface UserProfile {
  name?: string;
  location?: string;
  profession?: string;
  hobbies?: string[];
  social_twitter?: string;
  social_linkedin?: string;
  social_github?: string;
  social_instagram?: string;
  social_facebook?: string;
  bio?: string;
  preferences?: Record<string, unknown>;
}

export async function getUserProfile(databaseUrl: string): Promise<UserProfile | null> {
  const pool = getPool(databaseUrl);
  try {
    const result = await pool.query('SELECT * FROM user_profile WHERE id = $1', ['default']);
    if (result.rows.length === 0) return null;
    return result.rows[0] as UserProfile;
  } catch {
    return null;
  }
}
