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
- `@murph/channel-imessage` — BlueBubbles REST + webhook integration
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

## Commands

- `pnpm build` — Build all packages
- `pnpm murph start` — Start the agent
- `pnpm murph secret set/list/delete` — Manage secrets
- `pnpm run migrate` — Run database migrations

## Database

PostgreSQL with tables: messages, entities, memories (pgvector), audit_log, secrets, conversations, scheduled_tasks, knowledge_documents, knowledge_chunks (pgvector).

## Security Model

- Dashboard only on localhost:3141
- Approval levels: `require` (wait for user), `notify` (execute + alert), `auto` (silent)
- Strictest defaults — all external actions require approval
- No auto-install of MCP servers; all explicitly configured
