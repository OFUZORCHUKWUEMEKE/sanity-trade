import type { Db } from "@memebot/db";
import type { Redis } from "ioredis";
import type { Logger } from "pino";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPipeline } from "./pipeline.js";
import { SubscriptionManager } from "./subscription-manager.js";

const mint = "So11111111111111111111111111111111111111112";
const trader = "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM";
const signature =
  "5VfYmGB9JnpGx5LhFAX3bZ9M8YvBrH5F2QhpXhCkfYYwCzXhCzXhCzXhCzXhCzXhCzXhCzXhCzXhCzXh";

function buildDeps(overrides?: { walletLabels?: Map<string, string> }) {
  const insertOne = vi.fn().mockResolvedValue(undefined);
  const collection = vi.fn().mockReturnValue({ insertOne });
  const db = { collection } as unknown as Db;

  const redisSet = vi.fn().mockResolvedValue("OK");
  const xadd = vi.fn().mockResolvedValue("0-1");
  const redis = { set: redisSet, xadd } as unknown as Redis;

  const logger = { warn: vi.fn(), info: vi.fn(), error: vi.fn() } as unknown as Logger;
  const client = { send: vi.fn() };
  const subscriptionManager = new SubscriptionManager(10_000);

  return {
    db,
    redis,
    logger,
    streamKey: "memebot:events",
    dedupTtlSeconds: 600,
    subscriptionManager,
    client,
    walletLabels: overrides?.walletLabels ?? new Map<string, string>(),
    insertOne,
    xadd,
    redisSet,
  };
}

describe("pipeline", () => {
  const receivedAt = new Date("2026-01-01T00:00:00.000Z");

  it("processes a new token: persists raw, publishes, and tracks the mint for trades", async () => {
    const deps = buildDeps();
    const pipeline = createPipeline(deps);

    await pipeline.handleMessage(
      {
        txType: "create",
        signature,
        mint,
        traderPublicKey: trader,
        name: "Test Token",
        symbol: "TEST",
        pool: "pump",
      },
      receivedAt,
    );

    expect(deps.insertOne).toHaveBeenCalledWith(
      expect.objectContaining({ source: "pumpportal", type: "TokenLaunched" }),
    );
    expect(deps.xadd).toHaveBeenCalledTimes(1);
    expect(deps.client.send).toHaveBeenCalledWith({
      method: "subscribeTokenTrade",
      keys: [mint],
    });
    expect(pipeline.stats.newTokens).toBe(1);
  });

  it("skips duplicate events", async () => {
    const deps = buildDeps();
    deps.redisSet.mockResolvedValueOnce("OK").mockResolvedValueOnce(null);
    const pipeline = createPipeline(deps);

    const message = {
      txType: "create",
      signature,
      mint,
      traderPublicKey: trader,
      name: "Test Token",
      symbol: "TEST",
      pool: "pump",
    };

    await pipeline.handleMessage(message, receivedAt);
    await pipeline.handleMessage(message, receivedAt);

    expect(deps.insertOne).toHaveBeenCalledTimes(1);
    expect(pipeline.stats.duplicates).toBe(1);
  });

  it("classifies a trade from a watched wallet as SmartMoneyTrade", async () => {
    const deps = buildDeps({ walletLabels: new Map([[trader, "known-whale"]]) });
    const pipeline = createPipeline(deps);

    await pipeline.handleMessage(
      {
        txType: "buy",
        signature,
        mint,
        traderPublicKey: trader,
        tokenAmount: 1000,
        solAmount: 0.1,
        pool: "pump",
      },
      receivedAt,
    );

    expect(deps.insertOne).toHaveBeenCalledWith(
      expect.objectContaining({ type: "SmartMoneyTrade" }),
    );
    expect(pipeline.stats.smartMoneyTrades).toBe(1);
    expect(pipeline.stats.trades).toBe(0);
  });

  it("classifies a trade from an unwatched wallet as TradeExecuted", async () => {
    const deps = buildDeps();
    const pipeline = createPipeline(deps);

    await pipeline.handleMessage(
      {
        txType: "sell",
        signature,
        mint,
        traderPublicKey: trader,
        tokenAmount: 1000,
        solAmount: 0.1,
        pool: "pump",
      },
      receivedAt,
    );

    expect(pipeline.stats.trades).toBe(1);
    expect(pipeline.stats.smartMoneyTrades).toBe(0);
  });

  it("counts unrecognized payloads as invalid without throwing", async () => {
    const deps = buildDeps();
    const pipeline = createPipeline(deps);

    await pipeline.handleMessage({ message: "pong" }, receivedAt);

    expect(pipeline.stats.invalid).toBe(1);
    expect(deps.insertOne).not.toHaveBeenCalled();
  });

  it("still persists the raw event when normalization fails on an unrecognized pool", async () => {
    const deps = buildDeps();
    const pipeline = createPipeline(deps);

    await pipeline.handleMessage(
      {
        txType: "create",
        signature,
        mint,
        traderPublicKey: trader,
        name: "Test Token",
        symbol: "TEST",
        pool: "raydium",
      },
      receivedAt,
    );

    expect(deps.insertOne).toHaveBeenCalledTimes(1);
    expect(deps.xadd).not.toHaveBeenCalled();
    expect(pipeline.stats.invalid).toBe(1);
    expect(deps.logger.warn).toHaveBeenCalled();
  });
});

describe("pruneSubscriptions", () => {
  it("sends an unsubscribe command for expired mints", () => {
    const deps = buildDeps();
    const pipeline = createPipeline(deps);
    deps.subscriptionManager.track(mint, 0);

    pipeline.pruneSubscriptions(new Date(20_000));

    expect(deps.client.send).toHaveBeenCalledWith({
      method: "unsubscribeTokenTrade",
      keys: [mint],
    });
  });
});
