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

PostgreSQL with tables: messages, entities, memories (pgvector), audit_log, secrets, conversations, scheduled_tasks, knowledge_documents, knowledge_chunks (pgvector).

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

## Security Model

- Dashboard only on localhost:3141
- Approval levels: `require` (wait for user), `notify` (execute + alert), `auto` (silent)
- Strictest defaults — all external actions require approval
- No auto-install of MCP servers; all explicitly configured
