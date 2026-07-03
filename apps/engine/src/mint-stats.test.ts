import type { NormalizedEvent } from "@memebot/core";
import { describe, expect, it } from "vitest";
import { GRADUATION_MARKET_CAP_SOL, MintStatsTracker } from "./mint-stats.js";

const mint = "So11111111111111111111111111111111111111112";
const deployer = "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM";
const buyerA = "5Q544fKrFoe6tsEbD7S8EmxGTJYAKtTVhAW5Q5pge4j1";
const buyerB = "7Q544fKrFoe6tsEbD7S8EmxGTJYAKtTVhAW5Q5pge4j2";
const signature =
  "5VfYmGB9JnpGx5LhFAX3bZ9M8YvBrH5F2QhpXhCkfYYwCzXhCzXhCzXhCzXhCzXhCzXhCzXhCzXhCzXh";

const launchedAt = new Date("2026-01-01T00:00:00.000Z");

function tokenLaunched(): NormalizedEvent {
  return {
    eventType: "TokenLaunched",
    mint,
    deployer,
    name: "Test",
    symbol: "TEST",
    source: "pumpfun",
    launchedAt,
  };
}

function trade(trader: string, marketCapSol: number, occurredAt: Date): NormalizedEvent {
  return {
    eventType: "TradeExecuted",
    mint,
    trader,
    side: "buy",
    solAmount: 0.1,
    tokenAmount: 1000,
    priceSol: 0.0001,
    marketCapSol,
    signature,
    source: "pumpfun",
    occurredAt,
  };
}

describe("MintStatsTracker", () => {
  it("initializes stats on TokenLaunched", () => {
    const tracker = new MintStatsTracker();
    tracker.onEvent(tokenLaunched());
    expect(tracker.get(mint)).toMatchObject({ mint, launchedAt, marketCapSol: 0 });
  });

  it("tracks unique buyers across trades", () => {
    const tracker = new MintStatsTracker();
    tracker.onEvent(tokenLaunched());
    tracker.onEvent(trade(buyerA, 10, new Date("2026-01-01T00:01:00.000Z")));
    tracker.onEvent(trade(buyerA, 15, new Date("2026-01-01T00:01:30.000Z")));
    tracker.onEvent(trade(buyerB, 20, new Date("2026-01-01T00:02:00.000Z")));

    expect(tracker.get(mint)?.uniqueBuyers.size).toBe(2);
    expect(tracker.get(mint)?.marketCapSol).toBe(20);
  });

  it("creates an entry from a trade even if TokenLaunched was missed", () => {
    const tracker = new MintStatsTracker();
    tracker.onEvent(trade(buyerA, 5, launchedAt));
    expect(tracker.get(mint)).toBeDefined();
    expect(tracker.get(mint)?.uniqueBuyers.has(buyerA)).toBe(true);
  });

  it("computes curve progress percent relative to the graduation market cap", () => {
    const tracker = new MintStatsTracker();
    tracker.onEvent(tokenLaunched());
    tracker.onEvent(trade(buyerA, GRADUATION_MARKET_CAP_SOL / 2, launchedAt));

    expect(tracker.curveProgressPercent(mint)).toBeCloseTo(50);
  });

  it("caps curve progress at 100%", () => {
    const tracker = new MintStatsTracker();
    tracker.onEvent(tokenLaunched());
    tracker.onEvent(trade(buyerA, GRADUATION_MARKET_CAP_SOL * 3, launchedAt));

    expect(tracker.curveProgressPercent(mint)).toBe(100);
  });

  it("computes minutes since launch", () => {
    const tracker = new MintStatsTracker();
    tracker.onEvent(tokenLaunched());
    const now = new Date("2026-01-01T00:05:00.000Z");
    expect(tracker.minutesSinceLaunch(mint, now)).toBeCloseTo(5);
  });

  it("returns 0 for stats queries on an unknown mint", () => {
    const tracker = new MintStatsTracker();
    expect(tracker.curveProgressPercent("unknown")).toBe(0);
    expect(tracker.minutesSinceLaunch("unknown")).toBe(0);
  });
});
