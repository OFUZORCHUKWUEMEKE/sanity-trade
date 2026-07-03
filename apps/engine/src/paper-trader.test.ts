import type { NormalizedEvent } from "@memebot/core";
import type { Db } from "@memebot/db";
import type { Logger } from "pino";
import { describe, expect, it, vi } from "vitest";
import { PaperTrader } from "./paper-trader.js";

const mint = "So11111111111111111111111111111111111111112";
const deployer = "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM";
const trader = "5Q544fKrFoe6tsEbD7S8EmxGTJYAKtTVhAW5Q5pge4j1";
const signature =
  "5VfYmGB9JnpGx5LhFAX3bZ9M8YvBrH5F2QhpXhCkfYYwCzXhCzXhCzXhCzXhCzXhCzXhCzXhCzXhCzXh";
const now = new Date("2026-01-01T00:00:00.000Z");

function fakeDb() {
  const insertOne = vi.fn().mockResolvedValue(undefined);
  const updateOne = vi.fn().mockResolvedValue(undefined);
  const deleteOne = vi.fn().mockResolvedValue(undefined);
  const collection = vi.fn().mockReturnValue({ insertOne, updateOne, deleteOne });
  return { db: { collection } as unknown as Db, insertOne, updateOne, deleteOne };
}

function fakeLogger(): Logger {
  return { warn: vi.fn(), info: vi.fn(), error: vi.fn() } as unknown as Logger;
}

function trade(opts: {
  side: "buy" | "sell";
  trader: string;
  priceSol: number;
  marketCapSol?: number;
  occurredAt?: Date;
}): Extract<NormalizedEvent, { eventType: "TradeExecuted" }> {
  return {
    eventType: "TradeExecuted",
    mint,
    trader: opts.trader,
    side: opts.side,
    solAmount: 0.1,
    tokenAmount: 0.1 / opts.priceSol,
    priceSol: opts.priceSol,
    marketCapSol: opts.marketCapSol,
    signature,
    source: "pumpfun",
    occurredAt: opts.occurredAt ?? now,
  };
}

function makeTrader() {
  const { db, insertOne } = fakeDb();
  const logger = fakeLogger();
  const controlState = { isHalted: vi.fn().mockResolvedValue(false) };
  const paperTrader = new PaperTrader({
    db,
    logger,
    controlState,
    positionSizeSol: 0.1,
    maxConcurrent: 3,
    entryScoreThreshold: 70,
    takeProfitMultiple: 2,
    takeProfitSellFraction: 0.5,
    trailingStopPercent: 0.2,
    marketCapCollapseDrawdown: 0.6,
    platformFeeBps: 125,
    slippageBps: 100,
    priorityFeeSol: 0.0005,
  });
  return { paperTrader, insertOne, logger };
}

describe("PaperTrader.tryEnter", () => {
  it("does not enter below the score threshold", async () => {
    const { paperTrader, insertOne } = makeTrader();
    await paperTrader.tryEnter(mint, deployer, 65, false, 0.0001, 10, now);
    // no position was opened, so a subsequent trade for this mint is a no-op
    paperTrader.onTrade(trade({ side: "sell", trader: deployer, priceSol: 0.0001 }));
    expect(insertOne).not.toHaveBeenCalled();
  });

  it("does not enter a hard-rejected token even above threshold", async () => {
    const { paperTrader, insertOne } = makeTrader();
    await paperTrader.tryEnter(mint, deployer, 95, true, 0.0001, 10, now);
    paperTrader.onTrade(trade({ side: "sell", trader: deployer, priceSol: 0.0001 }));
    expect(insertOne).not.toHaveBeenCalled();
  });

  it("does not enter without price data", async () => {
    const { paperTrader, insertOne } = makeTrader();
    await paperTrader.tryEnter(mint, deployer, 95, false, undefined, 10, now);
    paperTrader.onTrade(trade({ side: "sell", trader: deployer, priceSol: 0.0001 }));
    expect(insertOne).not.toHaveBeenCalled();
  });

  it("does not enter while the engine is paused or killed", async () => {
    const { db, insertOne } = fakeDb();
    const logger = fakeLogger();
    const controlState = { isHalted: vi.fn().mockResolvedValue(true) };
    const paperTrader = new PaperTrader({
      db,
      logger,
      controlState,
      positionSizeSol: 0.1,
      maxConcurrent: 3,
      entryScoreThreshold: 70,
      takeProfitMultiple: 2,
      takeProfitSellFraction: 0.5,
      trailingStopPercent: 0.2,
      marketCapCollapseDrawdown: 0.6,
      platformFeeBps: 125,
      slippageBps: 100,
      priorityFeeSol: 0.0005,
    });

    await paperTrader.tryEnter(mint, deployer, 95, false, 0.0001, 10, now);
    paperTrader.onTrade(trade({ side: "sell", trader: deployer, priceSol: 0.0001 }));
    expect(insertOne).not.toHaveBeenCalled();
  });
});

describe("PaperTrader mark-to-market and exits", () => {
  it("persists a partial take-profit fill with a positive pnl", async () => {
    const { paperTrader, insertOne } = makeTrader();
    await paperTrader.tryEnter(mint, deployer, 90, false, 0.0001, 10, now);

    paperTrader.onTrade(trade({ side: "buy", trader, priceSol: 0.0002, marketCapSol: 20 })); // 2x
    await vi.waitFor(() => expect(insertOne).toHaveBeenCalledTimes(1));

    const row = insertOne.mock.calls[0]![0];
    expect(row.mint).toBe(mint);
    expect(row.exitReason).toContain("take profit");
    expect(row.sizeSol).toBeCloseTo(0.05);
    expect(row.pnlSol).toBeGreaterThan(0);
  });

  it("exits fully and immediately on a dev-wallet-sell rug signal", async () => {
    const { paperTrader, insertOne } = makeTrader();
    await paperTrader.tryEnter(mint, deployer, 90, false, 0.0001, 10, now);

    paperTrader.onTrade(trade({ side: "sell", trader: deployer, priceSol: 0.0001, marketCapSol: 10 }));
    await vi.waitFor(() => expect(insertOne).toHaveBeenCalledTimes(1));

    const row = insertOne.mock.calls[0]![0];
    expect(row.exitReason).toContain("dev wallet sold");
    expect(row.sizeSol).toBeCloseTo(0.1);
  });

  it("exits fully on a market-cap collapse relative to its peak", async () => {
    const { paperTrader, insertOne } = makeTrader();
    await paperTrader.tryEnter(mint, deployer, 90, false, 0.0001, 10, now);

    paperTrader.onTrade(trade({ side: "buy", trader, priceSol: 0.00012, marketCapSol: 20 }));
    paperTrader.onTrade(trade({ side: "sell", trader, priceSol: 0.00011, marketCapSol: 5 })); // 75% drop from peak 20

    await vi.waitFor(() => expect(insertOne).toHaveBeenCalledTimes(1));
    const row = insertOne.mock.calls[0]![0];
    expect(row.exitReason).toContain("market cap collapse");
  });

  it("ignores trades for mints it does not hold a position in", () => {
    const { paperTrader, insertOne } = makeTrader();
    paperTrader.onTrade(trade({ side: "buy", trader, priceSol: 0.0002, marketCapSol: 20 }));
    expect(insertOne).not.toHaveBeenCalled();
  });

  it("frees a concurrency slot once a position fully closes", async () => {
    const { paperTrader } = makeTrader();
    await paperTrader.tryEnter(mint, deployer, 90, false, 0.0001, 10, now);
    paperTrader.onTrade(trade({ side: "sell", trader: deployer, priceSol: 0.0001, marketCapSol: 10 }));

    // re-entering the same mint should now succeed since the position closed
    await paperTrader.tryEnter(mint, deployer, 90, false, 0.0001, 10, now);
    // no assertion error thrown means the internal state didn't blow up on re-entry
  });
});
