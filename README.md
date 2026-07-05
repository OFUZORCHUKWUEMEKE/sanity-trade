# memebot

Automated memecoin momentum trading system for Solana (Pump.fun / Bonk.fun ecosystem).
See `CLAUDE.md` for architecture, phases, and risk rules.

**Phase 1: Signal engine + paper trading. No real money.**

## Layout

```
apps/ingest    PumpPortal WebSocket consumer -> normalized events -> MongoDB + Redis stream
apps/engine    Filter pipeline, paper trader, exit manager
apps/notifier  Telegram alerts
apps/analysis  Paper-trading report CLI (the Phase 1 -> Phase 2 exit gate)
packages/core  Shared types, event schemas, scoring functions
packages/db    MongoDB client, collections, migrations
```

## Prerequisites

- Node.js 22+
- pnpm 10+
- Docker + Docker Compose (for local Redis)
- A MongoDB connection string (e.g. MongoDB Atlas)

## Setup

```bash
cp .env.example .env   # then set MONGODB_URI to your connection string
pnpm install
docker compose up -d   # starts Redis
```

To enable Telegram alerts and commands (`/status`, `/positions`, `/pause`,
`/resume`, `/kill`), create a bot with [@BotFather](https://t.me/BotFather) and
set `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID` in `.env`. Without them,
`apps/notifier` logs a warning and stays idle - it neither sends alerts nor
polls for commands.

## Run a service

```bash
pnpm dev:ingest
pnpm dev:engine
pnpm dev:notifier
```

Each service exposes a health check at `GET /health` and shuts down gracefully on
`SIGINT`/`SIGTERM`.

## Analysis report

`apps/analysis` is a one-shot CLI, not a long-running service. It reads
`paper_trades` and `token_scores`, and writes a markdown report (expectancy
after fees, win rate, which score checks best separate winners from losers,
which exit rule fires most, PnL by hour) including the Phase 1 -> Phase 2
exit-gate verdict from CLAUDE.md (>=100 signals, >=2 weeks of data, positive
expectancy after fees).

```bash
pnpm --filter @memebot/analysis run dev   # writes analysis-report.md and prints it
```

## Other commands

```bash
pnpm typecheck   # strict TS across all workspaces
pnpm test        # vitest across all workspaces
pnpm build       # compile all workspaces
```
