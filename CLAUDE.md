# Murph — AI Agent Framework

## Project Overview

Murph is a personal AI agent framework built on top of Claude Code CLI. It runs on a Mac Mini and provides a persistent, secure, extensible assistant reachable via iMessage, Telegram, or a local web dashboard.

## Architecture

- **Monorepo**: pnpm workspaces + Turborepo
- **Language**: TypeScript / Node.js (ESM)
- **Database**: PostgreSQL + pgvector for semantic search
- **Embeddings**: Local Ollama (nomic-embed-text, 768 dimensions)
- **LLM**: Claude Code CLI (shells out to `claude`)

## Package Structure

- `@murph/core` — Agent loop, Claude bridge, action registry, approval gates, audit logging
- `@murph/memory` — 3-tier memory (short-term buffer, PostgreSQL, pgvector semantic)
- `@murph/knowledge` — Second brain: Obsidian vault indexer, PDF/web ingestion, chunking + embedding
- `@murph/security` — AES-256-GCM secret store, sandboxed code execution, bcrypt+JWT auth
- `@murph/channel-telegram` — grammY Telegram bot with user allowlist
- `@murph/channel-imessage` — Direct iMessage database poller + AppleScript sender
- `@murph/mcp-client` — Multi-server MCP client (stdio + HTTP)
- `@murph/integration-bop` — BOP Framework hive mind (WebSocket provider + consumer)
- `@murph/scheduler` — croner-based cron engine with natural language parsing
- `@murph/creator` — Dynamic software creation + Cloudflare Pages deployment
- `@murph/dashboard` — Next.js local dashboard (localhost:3141)

## Key Conventions

- All packages use ESM (`"type": "module"`)
- Imports use `.js` extension (TypeScript ESM convention)
- Config in `murph.config.yaml`, validated with Zod
- Secrets encrypted with AES-256-GCM, master key in macOS Keychain
- All actions go through approval gates (default: strictest)
- All actions logged to `audit_log` table
- Database migrations in `packages/*/src/migrations/*.sql`
- **Always update documentation**: When changing commands, flags, configuration, APIs, or user-facing behavior, update `CLAUDE.md` (and any relevant README files) in the same changeset. Documentation should never drift from the code.

## Commands

- `pnpm build` — Build all packages
- `pnpm murph start` — Start the agent
- `pnpm murph doctor` — Run system diagnostics
- `pnpm murph google-auth` — Set up Google Workspace OAuth (interactive)
- `pnpm murph setup-plaud` — Set up Plaud MCP server (installs uv + plaud-mcp, verifies connection)
- `pnpm murph secret set/list/delete` — Manage secrets
- `pnpm run migrate` — Run database migrations

## Installation & Updates

Fresh install on a new Mac:

```bash
curl -fsSL "https://raw.githubusercontent.com/owenmecham/ai-agent-setup-script/main/install.sh?$(date +%s)" -o /tmp/murph-install.sh && bash /tmp/murph-install.sh
```

Code-only update (skips tool checks, safe restart):

```bash
~/murph/install.sh --update
```

Full re-install (re-checks all tools + code):

```bash
~/murph/install.sh
```

### install.sh flags

- `--update` / `-u` — Fast code-only update: pull, install deps, build, migrate, restart. The old process keeps running until the new build succeeds.
- `--yes` / `-y` — Skip the prerequisite confirmation prompt. Flags can be combined (`--update --yes`).

## Database

PostgreSQL with tables: messages, entities, memories (pgvector), audit_log, secrets, conversations, scheduled_tasks, knowledge_documents, knowledge_chunks (pgvector), email_maintenance_runs.

## Google Workspace Integration

Google Workspace (Gmail, Calendar, Tasks, Drive) is integrated via the official `@googleworkspace/cli` MCP server.

**Setup:** `pnpm murph google-auth` — walks through Google Cloud project creation, API enablement, and browser-based OAuth. Can also be triggered from the dashboard Settings page.

**How it works:**
- The `gws mcp` command runs as an MCP server (stdio transport) alongside the agent
- OAuth tokens are stored AES-256-GCM encrypted, key in macOS Keychain
- Tokens auto-refresh indefinitely (unless consent screen is in "Testing" mode — 7-day expiry)
- Write actions (send email, delete calendar events, delete Drive files) go through approval gates
- Read actions (list emails, view calendar, search Drive) are auto-approved

**Approval defaults for Google MCP actions:**
- `mcp.google.gmail.users.messages.send` → `require`
- `mcp.google.gmail.users.drafts.send` → `require`
- `mcp.google.calendar.events.insert` → `notify`
- `mcp.google.calendar.events.delete` → `require`
- `mcp.google.drive.files.delete` → `require`
- `mcp.google.drive.files.create` → `notify`
- All other Google MCP actions → `auto` (inherited from `mcp.*`)

## Plaud Integration

Plaud recordings and transcripts are accessible via the `plaud-mcp` MCP server, which proxies through the running Plaud Desktop app.

**Requirements:**
- Plaud Desktop installed and signed in (download from https://global.plaud.ai/pages/app-download)
- `uv` Python package manager (installed via `brew install uv`)
- `plaud-mcp` server (installed via `uv tool install plaud-mcp --from "git+https://github.com/davidlinjiahao/plaud-mcp"`)

**Setup:** `pnpm murph setup-plaud` — installs dependencies, configures the MCP server, and verifies the connection. Can also be triggered from the dashboard Settings page.

**How it works:**
- The `plaud-mcp` command runs as an MCP server (stdio transport) alongside the agent
- It communicates with the locally running Plaud Desktop app to access recordings
- Available tools: browse recordings, get transcripts, search transcript content, get AI summaries
- If Plaud Desktop is not running or not installed, the MCP client logs a connection error and continues

## Email Maintenance

Autonomous email scanning sub-agent that periodically reads emails via Gmail MCP, analyzes them against user-defined goals using Claude, and executes configurable actions.

**Dashboard:** `localhost:3141/email-maintenance` — full configuration UI with sample workflow templates, run history, and manual trigger buttons.

### Configuration Keys (`email_maintenance.*`)

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `enabled` | boolean | `false` | Master toggle |
| `goal` | string | `''` | What to scan for (natural language) |
| `model` | enum | `haiku` | Claude model: haiku, sonnet, opus |
| `cadence` | enum | `1h` | Scan frequency: 15m, 30m, 1h, 6h, daily |
| `next_steps` | string | `''` | What to do with matching emails |
| `gmail_query` | string | `''` | Gmail search filter (pre-filters before fetch) |
| `lookback_window` | enum | `24h` | How far back to scan: 1h, 6h, 24h, 3d, 7d |
| `max_emails_per_run` | number | `50` | Max emails to fetch per run (1-200) |
| `only_unread` | boolean | `true` | Only scan unread emails |
| `scan_labels` | string[] | `[]` | Specific Gmail labels to scan; empty = INBOX |
| `snippet_length` | number | `1000` | Chars of email body sent to LLM (100-5000) |
| `mark_read` | boolean | `false` | Allow marking emails as read |
| `archive` | boolean | `false` | Allow archiving emails |
| `apply_label` | string | `''` | Label to apply to processed emails |
| `auto_tasking` | boolean | `false` | Create Google Tasks from emails |
| `task_list` | string | `@default` | Google Tasks list name |
| `reply_enabled` | boolean | `false` | Allow drafting/sending replies |
| `reply_mode` | enum | `draft` | `draft` = create draft; `send` = auto-send |
| `forward_to` | string | `''` | Email address to forward matches to |
| `calendar_aware` | boolean | `false` | Check calendar before suggesting meeting times |
| `max_budget_per_run_usd` | number | `0.25` | Cap Claude API cost per run |
| `batch_size` | number | `20` | Emails per LLM call (1-50) |
| `run_window_start` | string | `''` | Only run after this hour (e.g. "08:00") |
| `run_window_end` | string | `''` | Only run before this hour (e.g. "18:00") |
| `notify_channel` | enum | `dashboard` | Where to send notifications |
| `notify_on` | enum | `matches_only` | When to notify: always, matches_only, errors_only |
| `privacy_keywords` | string[] | `[]` | Emails containing these are excluded from AI |

### Approval Defaults

- `email-maintenance.run` → `auto`
- `email-maintenance.mark_read` → `notify`
- `email-maintenance.archive` → `notify`
- `email-maintenance.apply_label` → `auto`
- `email-maintenance.create_task` → `notify`
- `email-maintenance.reply` → `require`
- `email-maintenance.forward` → `notify`

### Sample Workflows

The dashboard includes 6 pre-built workflow templates:
- **Property Underwriting** — Evaluate deals against cap rate, DSCR, occupancy thresholds
- **Receipt & Invoice Scanner** — Categorize billing, flag large charges, create tasks for due dates
- **Newsletter Digest** — Summarize and archive newsletters
- **Lead Qualification** — Score leads 1-10 and route high-scorers
- **Security Monitor** — Watch for login alerts, compromise warnings
- **Meeting Action Items** — Extract commitments and deadlines from meeting emails

### How It Works

1. Runs as a cron job within the agent process at the configured cadence
2. Fetches emails via Gmail MCP tools (`mcpManager.callTool()`)
3. Privacy-scrubs emails against keyword list
4. Spawns independent Claude subprocess for batch analysis
5. Executes actions (archive, label, reply, task creation) via Gmail/Tasks/Calendar MCP
6. Records run results in `email_maintenance_runs` table
7. All write actions respect their individual approval gates

### Calendar Integration

When `calendar_aware` is enabled, the engine fetches calendar events for the next 5 business days before LLM analysis. The AI can then suggest specific meeting times in reply drafts that don't conflict with existing appointments.

## Auto-Update

The agent automatically checks for code updates and applies them during a configurable install window.

**How it works:**
- Every `check_interval_hours` (default: 1 hour), runs `git ls-remote origin HEAD` (lightweight, no fetch, 15s timeout) and compares to local `git rev-parse HEAD`
- If remote differs from local, checks whether the current hour (in agent timezone) matches `install_hour`
- If in window: spawns `install.sh --update --yes` as a detached child process. The update script stops the running agent, pulls code, rebuilds, migrates, and restarts.
- If outside window: logs "outside install window" and defers until the next check

### Configuration Keys (`auto_update.*`)

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `enabled` | boolean | `true` | Master toggle |
| `check_interval_hours` | number | `1` | How often to check for updates (1-24) |
| `install_hour` | number | `1` | Hour of day (0-23) when updates are applied |

## Security Model

- Dashboard only on localhost:3141
- Approval levels: `require` (wait for user), `notify` (execute + alert), `auto` (silent)
- Strictest defaults — all external actions require approval
- No auto-install of MCP servers; all explicitly configured
