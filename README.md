# memebot

Automated memecoin momentum trading system for Solana (Pump.fun / Bonk.fun ecosystem).
See `CLAUDE.md` for architecture, phases, and risk rules.

**Phase 1: Signal engine + paper trading. No real money.**

## Layout

```
apps/ingest    PumpPortal WebSocket consumer -> normalized events -> Postgres + Redis stream
apps/engine    Filter pipeline, paper trader, exit manager
apps/notifier  Telegram alerts
packages/core  Shared types, event schemas, scoring functions
packages/db    Drizzle ORM + Postgres schema, migrations
```

## Prerequisites

- Node.js 22+
- pnpm 10+
- Docker + Docker Compose

## Setup

```bash
cp .env.example .env
pnpm install
docker compose up -d
```

## Run a service

```bash
pnpm dev:ingest
pnpm dev:engine
pnpm dev:notifier
```

Each service exposes a health check at `GET /health` and shuts down gracefully on
`SIGINT`/`SIGTERM`.

## Other commands

```bash
pnpm typecheck   # strict TS across all workspaces
pnpm test        # vitest across all workspaces
pnpm build       # compile all workspaces
```
