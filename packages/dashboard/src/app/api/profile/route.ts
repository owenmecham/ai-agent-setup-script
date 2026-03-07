import { NextRequest, NextResponse } from 'next/server';
import { getPool } from '../../../lib/db';

export async function GET() {
  const pool = getPool();
  try {
    const result = await pool.query('SELECT * FROM user_profile WHERE id = $1', ['default']);
    if (result.rows.length === 0) {
      return NextResponse.json(null);
    }
    return NextResponse.json(result.rows[0]);
  } catch {
    return NextResponse.json(null);
  }
}

export async function PUT(request: NextRequest) {
  const pool = getPool();
  const body = await request.json();

  const {
    name, location, profession, hobbies, bio,
    social_twitter, social_linkedin, social_github,
    social_instagram, social_facebook, preferences,
  } = body;

  try {
    await pool.query(
      `INSERT INTO user_profile (id, name, location, profession, hobbies, bio,
        social_twitter, social_linkedin, social_github, social_instagram, social_facebook,
        preferences, updated_at)
       VALUES ('default', $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW())
       ON CONFLICT (id) DO UPDATE SET
        name = COALESCE($1, user_profile.name),
        location = COALESCE($2, user_profile.location),
        profession = COALESCE($3, user_profile.profession),
        hobbies = COALESCE($4, user_profile.hobbies),
        bio = COALESCE($5, user_profile.bio),
        social_twitter = COALESCE($6, user_profile.social_twitter),
        social_linkedin = COALESCE($7, user_profile.social_linkedin),
        social_github = COALESCE($8, user_profile.social_github),
        social_instagram = COALESCE($9, user_profile.social_instagram),
        social_facebook = COALESCE($10, user_profile.social_facebook),
        preferences = COALESCE($11, user_profile.preferences),
        updated_at = NOW()`,
      [
        name ?? null, location ?? null, profession ?? null,
        hobbies ?? null, bio ?? null,
        social_twitter ?? null, social_linkedin ?? null,
        social_github ?? null, social_instagram ?? null,
        social_facebook ?? null, preferences ? JSON.stringify(preferences) : null,
      ],
    );

    const result = await pool.query('SELECT * FROM user_profile WHERE id = $1', ['default']);
    return NextResponse.json(result.rows[0]);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to save profile' },
      { status: 500 },
    );
  }
}
