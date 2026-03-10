import { NextResponse, type NextRequest } from 'next/server';
import { homedir } from 'os';
import { join } from 'path';

const HOME = homedir();
const CONFIG_DIR = join(HOME, '.config', 'murph', 'google');
const CRED_PATH = join(CONFIG_DIR, 'client_secret.json');
const TOKEN_PATH = join(CONFIG_DIR, 'token.json');

// GET — handle OAuth callback from Google
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code');
  const error = searchParams.get('error');

  if (error) {
    return NextResponse.redirect(
      new URL(`/settings?google_auth=error&message=${encodeURIComponent(error)}`, request.url),
    );
  }

  if (!code) {
    return NextResponse.redirect(
      new URL('/settings?google_auth=error&message=No+authorization+code+received', request.url),
    );
  }

  try {
    const { GoogleClient } = await import('@murph/integration-google');
    const redirectUri = 'http://localhost:3141/api/google-auth/callback';
    await GoogleClient.exchangeCode(CRED_PATH, TOKEN_PATH, code, redirectUri);

    return NextResponse.redirect(new URL('/settings?google_auth=success', request.url));
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Token exchange failed';
    return NextResponse.redirect(
      new URL(`/settings?google_auth=error&message=${encodeURIComponent(message)}`, request.url),
    );
  }
}
