import { paperTradesCollection, tokenScoresCollection, type Db, type PaperTradeDoc } from "@memebot/db";
import type { Logger } from "pino";
import { formatTradeAlert } from "./format.js";
import type { TelegramClient } from "./telegram-client.js";

export interface TradeWatcherDeps {
  db: Db;
  telegram: TelegramClient;
  chatId: string;
  logger: Logger;
}

export async function handleNewTrade(deps: TradeWatcherDeps, doc: PaperTradeDoc): Promise<void> {
  try {
    const scoreDoc = await tokenScoresCollection(deps.db)
      .find({ mint: doc.mint, checkedAt: { $lte: doc.entryAt } })
      .sort({ checkedAt: -1 })
      .limit(1)
      .next();

    const text = formatTradeAlert({
      mint: doc.mint,
      entryAt: doc.entryAt,
      entryPrice: doc.entryPrice,
      exitAt: doc.exitAt ?? new Date(),
      exitPrice: doc.exitPrice ?? doc.entryPrice,
      sizeSol: doc.sizeSol,
      pnlSol: doc.pnlSol ?? 0,
      entryReason: doc.entryReason,
      exitReason: doc.exitReason ?? "unknown",
      simulatedFeesSol: doc.simulatedFeesSol,
      simulatedSlippageSol: doc.simulatedSlippageSol,
      scoreBreakdown: scoreDoc?.checks,
    });

    await deps.telegram.sendMessage(deps.chatId, text);
  } catch (err) {
    deps.logger.error({ err, mint: doc.mint }, "failed to send trade alert");
  }
}

/**
 * Watches paper_trades for new (inserted) rows via a Mongo change stream -
 * every fill the engine records (partial take-profit, trailing stop, rug
 * exit) triggers one alert. Requires a replica-set-backed Mongo (Atlas
 * qualifies); a standalone mongod can't open change streams.
 */
export function startTradeWatcher(deps: TradeWatcherDeps): { stop: () => Promise<void> } {
  const changeStream = paperTradesCollection(deps.db).watch([
    { $match: { operationType: "insert" } },
  ]);

  changeStream.on("change", (change) => {
    if (change.operationType === "insert") {
      handleNewTrade(deps, change.fullDocument).catch((err: unknown) => {
        deps.logger.error({ err }, "trade watcher handler failed");
      });
    }
  });

  changeStream.on("error", (err: unknown) => {
    deps.logger.error({ err }, "paper_trades change stream error");
  });

  return {
    stop: async () => {
      await changeStream.close();
    },
  };
}
