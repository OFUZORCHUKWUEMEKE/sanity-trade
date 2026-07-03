import type { Db } from "@memebot/db";
import type { Redis } from "ioredis";
import type { Logger } from "pino";
import { dedupKeyForSignature, isDuplicate } from "./dedup.js";
import { normalizeNewToken, normalizeSmartMoneyTrade, normalizeTrade } from "./normalize.js";
import { isRawNewToken, isRawTrade } from "./pumpportal-raw.js";
import { persistRawEvent } from "./raw-store.js";
import { SubscriptionManager } from "./subscription-manager.js";
import type { PumpPortalClient } from "./pumpportal-client.js";
import { publishEvent } from "./stream-publisher.js";

const INGEST_SOURCE = "pumpportal";

export interface PipelineStats {
  newTokens: number;
  trades: number;
  smartMoneyTrades: number;
  duplicates: number;
  invalid: number;
}

export interface PipelineDeps {
  db: Db;
  redis: Redis;
  logger: Logger;
  streamKey: string;
  dedupTtlSeconds: number;
  subscriptionManager: SubscriptionManager;
  client: Pick<PumpPortalClient, "send">;
  walletLabels: Map<string, string>;
}

export function createPipeline(deps: PipelineDeps) {
  const stats: PipelineStats = {
    newTokens: 0,
    trades: 0,
    smartMoneyTrades: 0,
    duplicates: 0,
    invalid: 0,
  };

  async function handleMessage(raw: unknown, receivedAt: Date = new Date()): Promise<void> {
    if (typeof raw !== "object" || raw === null) {
      stats.invalid++;
      return;
    }

    if (isRawNewToken(raw)) {
      const dupKey = dedupKeyForSignature(raw.signature);
      if (await isDuplicate(deps.redis, dupKey, deps.dedupTtlSeconds)) {
        stats.duplicates++;
        return;
      }
      await persistRawEvent(deps.db, INGEST_SOURCE, "TokenLaunched", raw, receivedAt);

      try {
        const event = normalizeNewToken(raw, receivedAt);
        await publishEvent(deps.redis, deps.streamKey, event);
        stats.newTokens++;

        const command = deps.subscriptionManager.track(raw.mint, receivedAt.getTime());
        if (command) {
          deps.client.send(command);
        }
      } catch (err) {
        deps.logger.warn({ err, mint: raw.mint }, "failed to normalize TokenLaunched event");
        stats.invalid++;
      }
      return;
    }

    if (isRawTrade(raw)) {
      const dupKey = dedupKeyForSignature(raw.signature);
      if (await isDuplicate(deps.redis, dupKey, deps.dedupTtlSeconds)) {
        stats.duplicates++;
        return;
      }

      const walletLabel = deps.walletLabels.get(raw.traderPublicKey);
      const type = walletLabel ? "SmartMoneyTrade" : "TradeExecuted";
      await persistRawEvent(deps.db, INGEST_SOURCE, type, raw, receivedAt);

      try {
        const event = walletLabel
          ? normalizeSmartMoneyTrade(raw, walletLabel, receivedAt)
          : normalizeTrade(raw, receivedAt);
        await publishEvent(deps.redis, deps.streamKey, event);
        if (walletLabel) {
          stats.smartMoneyTrades++;
        } else {
          stats.trades++;
        }
      } catch (err) {
        deps.logger.warn({ err, mint: raw.mint }, "failed to normalize trade event");
        stats.invalid++;
      }
      return;
    }

    stats.invalid++;
  }

  function pruneSubscriptions(now: Date = new Date()): void {
    const command = deps.subscriptionManager.pruneExpired(now.getTime());
    if (command) {
      deps.client.send(command);
    }
  }

  return { handleMessage, pruneSubscriptions, stats };
}
