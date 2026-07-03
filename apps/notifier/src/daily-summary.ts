import { paperTradesCollection, tokenScoresCollection, type Db } from "@memebot/db";
import type { Logger } from "pino";
import { formatDailySummary, type DailySummaryInput } from "./format.js";
import type { TelegramClient } from "./telegram-client.js";

export async function computeDailySummary(
  db: Db,
  periodStart: Date,
  periodEnd: Date,
): Promise<DailySummaryInput> {
  const signalsSeen = await tokenScoresCollection(db).countDocuments({
    checkedAt: { $gte: periodStart, $lt: periodEnd },
  });

  const trades = await paperTradesCollection(db)
    .find({ exitAt: { $gte: periodStart, $lt: periodEnd } })
    .toArray();

  const tradesTaken = trades.length;
  const wins = trades.filter((t) => (t.pnlSol ?? 0) > 0).length;
  const losses = tradesTaken - wins;
  const totalPnl = trades.reduce((sum, t) => sum + (t.pnlSol ?? 0), 0);
  const expectancySol = tradesTaken > 0 ? totalPnl / tradesTaken : 0;

  let bestTrade: { mint: string; pnlSol: number } | undefined;
  let worstTrade: { mint: string; pnlSol: number } | undefined;
  for (const trade of trades) {
    const pnlSol = trade.pnlSol ?? 0;
    if (!bestTrade || pnlSol > bestTrade.pnlSol) bestTrade = { mint: trade.mint, pnlSol };
    if (!worstTrade || pnlSol < worstTrade.pnlSol) worstTrade = { mint: trade.mint, pnlSol };
  }

  return {
    periodStart,
    periodEnd,
    signalsSeen,
    tradesTaken,
    wins,
    losses,
    expectancySol,
    bestTrade,
    worstTrade,
  };
}

export interface DailySummaryDeps {
  db: Db;
  telegram: TelegramClient;
  chatId: string;
  logger: Logger;
}

export async function sendDailySummary(
  deps: DailySummaryDeps,
  periodStart: Date,
  periodEnd: Date,
): Promise<void> {
  const summary = await computeDailySummary(deps.db, periodStart, periodEnd);
  await deps.telegram.sendMessage(deps.chatId, formatDailySummary(summary));
}

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

/** Fires sendDailySummary once per UTC calendar day, the first time tick()
 * is called at or after the configured UTC hour. UTC (not server-local
 * time) so behavior doesn't depend on the host's timezone configuration. */
export class DailySummaryScheduler {
  private lastSentDateKey: string | undefined;

  constructor(
    private readonly deps: DailySummaryDeps,
    private readonly hour: number,
  ) {}

  async tick(now: Date = new Date()): Promise<void> {
    const dateKey = now.toISOString().slice(0, 10);
    if (now.getUTCHours() < this.hour || this.lastSentDateKey === dateKey) {
      return;
    }
    this.lastSentDateKey = dateKey;

    const periodEnd = now;
    const periodStart = new Date(now.getTime() - ONE_DAY_MS);
    await sendDailySummary(this.deps, periodStart, periodEnd).catch((err: unknown) => {
      this.deps.logger.error({ err }, "failed to send daily summary");
    });
  }

  start(intervalMs = 60_000): NodeJS.Timeout {
    return setInterval(() => {
      this.tick().catch((err: unknown) => {
        this.deps.logger.error({ err }, "daily summary tick failed");
      });
    }, intervalMs);
  }
}
