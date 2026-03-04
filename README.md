# Murph

A personal AI agent framework built on top of Claude Code CLI. Murph runs on a Mac Mini and provides a persistent, secure, extensible assistant reachable via iMessage, Telegram, or a local web dashboard.

## Features

- **Multi-channel messaging** — Talk to Murph through iMessage (via BlueBubbles), Telegram, or a local web dashboard
- **3-tier memory** — Short-term buffer, PostgreSQL long-term storage, and pgvector semantic search
- **Knowledge base** — Ingest and search your Obsidian vault, PDFs, web pages, Granola transcripts, and Plaud voice notes
- **Approval gates** — Every action goes through configurable approval levels (`require`, `notify`, or `auto`)
- **Audit logging** — All actions recorded to PostgreSQL with full parameter and result tracking
- **Encrypted secrets** — AES-256-GCM encryption with the master key stored in macOS Keychain
- **Scheduler** — Natural-language cron jobs powered by croner
- **Creator** — Dynamically generate and deploy software to Cloudflare Pages
- **MCP client** — Connect to any Model Context Protocol server (stdio or HTTP)
- **Integrations** — Gmail, Google Drive, HubSpot, GoHighLevel, Playwright browser automation, BOP Framework hive mind

## Architecture

```
┌─────────────┐  ┌──────────────┐  ┌───────────────┐
│  Telegram    │  │  iMessage    │  │  Dashboard    │
│  (grammY)    │  │ (BlueBubbles)│  │  (Next.js)    │
└──────┬───────┘  └──────┬───────┘  └──────┬────────┘
       │                 │                 │
       └────────────┬────┴─────────────────┘
                    │
             ┌──────▼──────┐
             │  @murph/core │
             │  Agent Loop  │
             │  Claude CLI  │
             └──────┬──────┘
                    │
       ┌────────────┼────────────┐
       │            │            │
  ┌────▼────┐ ┌────▼────┐ ┌────▼─────┐
  │ Memory  │ │Knowledge│ │ Security │
  │ pgvector│ │ Obsidian│ │ Keychain │
  └─────────┘ └─────────┘ └──────────┘
```

**Stack:** TypeScript/Node.js (ESM), pnpm workspaces, Turborepo, PostgreSQL + pgvector, Ollama embeddings, Claude Code CLI.

## Packages

| Package | Description |
|---|---|
| `@murph/core` | Agent loop, Claude bridge, action registry, approval gates, audit logging |
| `@murph/memory` | 3-tier memory: short-term buffer, PostgreSQL, pgvector semantic search |
| `@murph/knowledge` | Obsidian vault indexer, PDF/web ingestion, chunking + embedding |
| `@murph/security` | AES-256-GCM secret store, sandboxed code execution, bcrypt+JWT auth |
| `@murph/channel-telegram` | Telegram bot with user allowlist |
| `@murph/channel-imessage` | BlueBubbles REST + webhook integration |
| `@murph/mcp-client` | Multi-server MCP client (stdio + HTTP) |
| `@murph/scheduler` | Cron engine with natural language parsing |
| `@murph/creator` | Dynamic software creation + Cloudflare Pages deployment |
| `@murph/dashboard` | Next.js web dashboard on localhost:3141 |
| `@murph/integration-bop` | BOP Framework hive mind (WebSocket) |
| `@murph/integration-cloudflare` | Cloudflare API |
| `@murph/integration-gdrive` | Google Drive |
| `@murph/integration-gmail` | Gmail |
| `@murph/integration-gohighlevel` | GoHighLevel CRM |
| `@murph/integration-hubspot` | HubSpot CRM |
| `@murph/integration-playwright` | Browser automation |

## Prerequisites

- macOS (designed for Mac Mini)
- Node.js 20+
- pnpm 9+
- PostgreSQL 16 with pgvector
- Ollama with `nomic-embed-text` model
- Claude Code CLI

## Quick Start

The install script handles all dependencies automatically:

```bash
curl -fsSL https://raw.githubusercontent.com/owenmecham/ai-agent-setup-script/main/install.sh -o /tmp/murph-install.sh && bash /tmp/murph-install.sh
```

This installs Xcode CLI tools, Homebrew, Node.js, pnpm, PostgreSQL + pgvector, Ollama, Claude Code CLI, Claude Desktop, Wrangler, and Playwright. It then runs `pnpm install`, builds all packages, and applies database migrations.

To update an existing install (code only, no tool re-checks):

```bash
~/murph/install.sh --update
```

## Manual Setup

### 1. Install system dependencies

```bash
brew install postgresql@16 pgvector ollama
brew services start postgresql@16
```

### 2. Set up the database

```bash
createdb murph
psql -d murph -c 'CREATE EXTENSION IF NOT EXISTS "uuid-ossp";'
psql -d murph -c 'CREATE EXTENSION IF NOT EXISTS "vector";'
```

### 3. Pull the embedding model

```bash
ollama pull nomic-embed-text
```

### 4. Install Claude Code CLI

```bash
npm install -g @anthropic-ai/claude-code
```

### 5. Install project dependencies

```bash
pnpm install
```

### 6. Build all packages

```bash
pnpm build
```

### 7. Run database migrations

```bash
pnpm run migrate
```

### 8. Configure

Edit `murph.config.yaml` to enable channels and integrations. Set secrets:

```bash
pnpm murph secret set TELEGRAM_BOT_TOKEN <your-token>
pnpm murph secret set BLUEBUBBLES_PASSWORD <your-password>
```

### 9. Start

```bash
pnpm murph start
```

## Configuration

All configuration lives in `murph.config.yaml`. Key sections:

```yaml
agent:
  name: "Murph"
  model: "sonnet"
  max_budget_per_message_usd: 0.50
  timezone: "America/Denver"

database:
  url: "postgresql://localhost:5432/murph"

embedding:
  provider: "ollama"
  model: "nomic-embed-text"
  ollama_url: "http://localhost:11434"

channels:
  telegram:
    enabled: false
    bot_token: "${TELEGRAM_BOT_TOKEN}"
    allowed_user_ids: []
  imessage:
    enabled: false
    bluebubbles_url: "http://localhost:1234"
    bluebubbles_password: "${BLUEBUBBLES_PASSWORD}"
    webhook_port: 3142
```

Secret references (`${SECRET_NAME}`) are resolved at runtime from the encrypted secret store.

## Approval Levels

Every action goes through an approval gate. Configure defaults per action pattern in `murph.config.yaml`:

| Level | Behavior |
|---|---|
| `require` | Pause and wait for explicit user approval |
| `notify` | Execute immediately, send a notification |
| `auto` | Execute silently |

Wildcard patterns are supported (e.g., `bop.*`, `playwright.*`).

## Channel Setup

### Telegram

1. Create a bot via [@BotFather](https://t.me/BotFather)
2. Store the token: `pnpm murph secret set TELEGRAM_BOT_TOKEN <token>`
3. Add your Telegram user ID to `allowed_user_ids` in config
4. Set `channels.telegram.enabled: true`

### iMessage (BlueBubbles)

1. Install [BlueBubbles](https://bluebubbles.app) on your Mac
2. Enable the Private API in BlueBubbles settings
3. Configure the REST API on port 1234
4. Set the webhook URL to `http://localhost:3142/webhook`
5. Store the password: `pnpm murph secret set BLUEBUBBLES_PASSWORD <password>`
6. Set `channels.imessage.enabled: true`

### Dashboard

The web dashboard runs on `http://localhost:3141` and provides chat, audit log, knowledge base, memory, scheduler, and settings views.

## Commands

```bash
pnpm build                     # Build all packages
pnpm dev                       # Start in development mode
pnpm murph start               # Start the agent
pnpm murph secret set <k> <v>  # Store an encrypted secret
pnpm murph secret list         # List stored secrets
pnpm murph secret delete <k>   # Delete a secret
pnpm run migrate               # Run database migrations
```

## Security

- All secrets encrypted with AES-256-GCM; master key stored in macOS Keychain
- Dashboard bound to localhost only (port 3141)
- Strictest approval defaults — all external actions require explicit approval
- Full audit trail of every action in PostgreSQL
- MCP servers must be explicitly configured (no auto-install)

## Database

PostgreSQL with the following tables:

| Table | Purpose |
|---|---|
| `messages` | Conversation history |
| `conversations` | Conversation metadata |
| `entities` | Extracted named entities |
| `memories` | Semantic memories with pgvector embeddings |
| `knowledge_documents` | Indexed documents (Obsidian, PDF, web) |
| `knowledge_chunks` | Document chunks with pgvector embeddings |
| `audit_log` | Action audit trail |
| `secrets` | Encrypted credentials |
| `scheduled_tasks` | Cron job definitions |

## License

Private.
