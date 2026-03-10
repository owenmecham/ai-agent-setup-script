# Google Workspace MCP — Full Setup Guide

This guide covers end-to-end setup: creating a Google Cloud project, configuring OAuth, and wiring workspace-mcp into both the Murph agent (iMessage/chat) and Claude Code CLI (terminal).

---

## Part 1: Google Cloud Project & OAuth Credentials

Each Murph instance is a personal agent — you create your own Google Cloud project and Desktop OAuth client. No shared credentials.

### 1.1 Create a Google Cloud Project

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Click the project dropdown (top bar) → **New Project**
3. Name it something like `murph-personal` → **Create**
4. Select the new project from the dropdown

### 1.2 Enable APIs

Go to **APIs & Services → Library** and enable all of these:

| API | Search Term |
|-----|-------------|
| Gmail API | `Gmail` |
| Google Calendar API | `Calendar` |
| Google Drive API | `Drive` |
| Google Tasks API | `Tasks` |
| Google Docs API | `Docs` |
| Google Sheets API | `Sheets` |
| Google Slides API | `Slides` |
| Google Forms API | `Forms` |
| Google Chat API | `Chat` |
| People API (Contacts) | `People` |
| Apps Script API | `Apps Script` |
| Custom Search API | `Custom Search` |

### 1.3 Configure OAuth Consent Screen

1. Go to **APIs & Services → OAuth consent screen**
2. Click **Get Started** (or **Configure Consent Screen**)
3. Choose **External** user type → **Create**
4. Fill in:
   - App name: `Murph`
   - User support email: your email
   - Developer contact: your email
5. Click **Save and Continue** through the remaining steps

#### Add yourself as a test user

1. Under **OAuth consent screen → Audience** (or **Test users**)
2. Click **Add users**
3. Enter your Google account email → **Save**

#### Add Data Access scopes

1. Under **OAuth consent screen → Data Access** (or **Scopes**)
2. Click **Add or remove scopes**
3. Add scopes for every API you enabled above — search by API name and check all relevant scopes
4. **Save**

### 1.4 Create Desktop OAuth Credentials

1. Go to **APIs & Services → Credentials**
2. Click **+ Create Credentials → OAuth client ID**
3. Application type: **Desktop app**
4. Name: `murph-desktop`
5. Click **Create**
6. Copy the **Client ID** and **Client Secret** — you'll need both

---

## Part 2: Murph Agent Setup (iMessage / Chat)

This configures Google Workspace for the Murph agent process — the one that handles iMessage, scheduled tasks, email maintenance, and the dashboard.

### 2.1 Run the Google Auth CLI

```bash
pnpm murph google-auth
```

This will:
1. Prompt for your **Client ID** and **Client Secret** (or reuse existing ones)
2. Save them as exports in `~/.zshrc`:
   ```bash
   export GOOGLE_OAUTH_CLIENT_ID="your-client-id"
   export GOOGLE_OAUTH_CLIENT_SECRET="your-client-secret"
   ```
3. Spawn `uvx workspace-mcp --single-user --tool-tier core` to initiate OAuth
4. Open a browser window for Google authorization
5. Poll `~/.google_workspace_mcp/credentials/` until tokens are saved (up to 3 minutes)

**If you already have credentials** and need to re-authenticate:
```bash
pnpm murph google-auth
# → "Re-authenticate? This will clear existing tokens. (y/N)" → y
```

### 2.2 Verify the Config

The MCP server is already configured in `murph.config.yaml`:

```yaml
mcp_servers:
  - name: "google"
    transport: "stdio"
    command: "uvx"
    args: ["workspace-mcp", "--tool-tier", "core"]
    env:
      OAUTHLIB_INSECURE_TRANSPORT: "1"
```

No changes needed — this is the default.

### 2.3 Restart the Agent

If the agent is running via LaunchAgent:
```bash
# Regenerate the plist to capture new env vars
node packages/installer/dist/server.js

# Or just restart
launchctl stop com.murph.agent
# KeepAlive will restart it automatically
```

Or manually:
```bash
pnpm murph start
```

### 2.4 Verify Connection

Check the dashboard at `http://localhost:3141/settings` — Google Workspace should show as connected. Or check logs:
```bash
tail -f ~/.murph/murph.log | grep -i google
```

---

## Part 3: Claude Code CLI Setup (Terminal)

This configures Google Workspace as an MCP server for Claude Code in your terminal — so you can use Google tools directly from `claude` sessions.

### 3.1 Ensure Environment Variables Are Set

The OAuth credentials from Part 2 should already be in `~/.zshrc`. Verify:

```bash
echo $GOOGLE_OAUTH_CLIENT_ID
echo $GOOGLE_OAUTH_CLIENT_SECRET
```

If empty, source your profile:
```bash
source ~/.zshrc
```

### 3.2 Ensure OAuth Tokens Exist

If you completed Part 2, tokens are already at `~/.google_workspace_mcp/credentials/`. If not, run the auth flow:

```bash
pnpm murph google-auth
```

### 3.3 Add workspace-mcp to Claude Code

Add the MCP server config to your project's `.mcp.json` (in the repo root) or to `~/.claude/settings.json` (global):

**Option A — Project-level (`.mcp.json` in repo root):**

```json
{
  "mcpServers": {
    "google": {
      "command": "uvx",
      "args": ["workspace-mcp", "--tool-tier", "core"],
      "env": {
        "OAUTHLIB_INSECURE_TRANSPORT": "1"
      }
    }
  }
}
```

**Option B — Global (`~/.claude/settings.json`):**

Add an `mcpServers` key:

```json
{
  "mcpServers": {
    "google": {
      "command": "uvx",
      "args": ["workspace-mcp", "--tool-tier", "core"],
      "env": {
        "OAUTHLIB_INSECURE_TRANSPORT": "1"
      }
    }
  }
}
```

### 3.4 Verify in Claude Code

Start a new Claude Code session and check that Google tools are available:

```
claude
> /mcp
```

You should see the `google` server listed with tools like `list_calendars`, `search_gmail`, `list_drive_files`, etc.

---

## Part 4: How It All Fits Together

```
┌─────────────────────────────────────────────────────┐
│                   Google Cloud                       │
│  Project: murph-personal                            │
│  OAuth Client: Desktop app                          │
│  APIs: Gmail, Calendar, Drive, Tasks, Docs, etc.    │
└──────────────────────┬──────────────────────────────┘
                       │ OAuth 2.0 tokens
                       ▼
            ~/.google_workspace_mcp/
            └── credentials/*.json     ← shared token store
                       │
          ┌────────────┴────────────┐
          ▼                         ▼
   Murph Agent                Claude Code CLI
   (pnpm murph start)        (claude)
          │                         │
   murph.config.yaml          .mcp.json or
   mcp_servers:               ~/.claude/settings.json
     - name: google             mcpServers:
       command: uvx               google:
       args: [workspace-mcp]       command: uvx
          │                         │
          └────────────┬────────────┘
                       ▼
              uvx workspace-mcp
              --tool-tier core
              (stdio transport)
```

**Key points:**
- Both Murph and Claude Code use the **same OAuth tokens** at `~/.google_workspace_mcp/credentials/`
- Both spawn `uvx workspace-mcp` as a child process (stdio transport)
- Environment variables (`GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`) must be available to both processes
- `OAUTHLIB_INSECURE_TRANSPORT=1` is required because the OAuth callback uses `http://localhost`

---

## Troubleshooting

### "Access blocked: This app's request is invalid" (Error 400)
- You're using **Web Application** credentials instead of **Desktop app**. Delete the credential and create a new one with type **Desktop app**.

### OAuth flow opens but fails with scope errors
- Go to **OAuth consent screen → Data Access** and add scopes for all enabled APIs.
- Make sure your Google account is listed as a test user under **Audience**.

### Tokens expire / "invalid_grant"
- Re-run `pnpm murph google-auth` and choose to re-authenticate.
- This clears `~/.google_workspace_mcp/credentials/` and re-does the OAuth flow.

### workspace-mcp not found
- Install it: `uv tool install workspace-mcp`
- Or ensure `~/.local/bin` is in your PATH.

### Claude Code doesn't show Google tools
- Make sure `.mcp.json` is in the directory where you launch `claude`, or use global settings.
- Check that `GOOGLE_OAUTH_CLIENT_ID` and `GOOGLE_OAUTH_CLIENT_SECRET` are set in your shell.
- Run `source ~/.zshrc` then relaunch `claude`.
