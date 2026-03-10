import { NextResponse } from 'next/server';
import { existsSync, unlinkSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';

const HOME = homedir();
const CONFIG_DIR = join(HOME, '.config', 'murph', 'google');
const CRED_PATH = join(CONFIG_DIR, 'client_secret.json');
const TOKEN_PATH = join(CONFIG_DIR, 'token.json');

// GET — check auth status
export async function GET() {
  const hasClientCredentials = existsSync(CRED_PATH);
  const hasToken = existsSync(TOKEN_PATH);

  if (!hasClientCredentials) {
    return NextResponse.json({
      installed: true, // no external CLI needed
      authenticated: false,
      email: null,
      hasClientCredentials: false,
      error: 'Missing client_secret.json — download from Google Cloud Console',
    });
  }

  if (!hasToken) {
    return NextResponse.json({
      installed: true,
      authenticated: false,
      email: null,
      hasClientCredentials: true,
      error: 'Not authenticated — click Connect Google Account',
    });
  }

  // Try to validate the token
  try {
    const { GoogleClient } = await import('@murph/integration-google');
    const client = new GoogleClient({ credentialsPath: CRED_PATH, tokenPath: TOKEN_PATH });
    await client.init();
    const authenticated = await client.isAuthenticated();

    return NextResponse.json({
      installed: true,
      authenticated,
      email: null,
      hasClientCredentials: true,
      error: authenticated ? null : 'Token expired — re-authenticate',
    });
  } catch (err) {
    return NextResponse.json({
      installed: true,
      authenticated: false,
      email: null,
      hasClientCredentials: true,
      error: err instanceof Error ? err.message : 'Failed to validate token',
    });
  }
}

// POST — generate auth URL and redirect
export async function POST() {
  if (!existsSync(CRED_PATH)) {
    return NextResponse.json(
      { error: 'Missing client_secret.json. Download from Google Cloud Console and save to ~/.config/murph/google/' },
      { status: 400 },
    );
  }

  try {
    const { GoogleClient, GOOGLE_SCOPES } = await import('@murph/integration-google');
    const redirectUri = 'http://localhost:3141/api/google-auth/callback';
    const authUrl = await GoogleClient.getAuthUrl(CRED_PATH, GOOGLE_SCOPES, redirectUri);

    return NextResponse.json({ authUrl });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to generate auth URL' },
      { status: 500 },
    );
  }
}

// DELETE — disconnect (remove token)
export async function DELETE() {
  try {
    if (existsSync(TOKEN_PATH)) {
      unlinkSync(TOKEN_PATH);
    }
    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to remove token' },
      { status: 500 },
    );
  }
}
