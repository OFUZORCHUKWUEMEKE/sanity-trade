import type { Db } from "@memebot/db";
import type { Logger } from "pino";
import { describe, expect, it, vi } from "vitest";
import { computeDailySummary, DailySummaryScheduler } from "./daily-summary.js";
import type { TelegramClient } from "./telegram-client.js";

const mint = "So11111111111111111111111111111111111111112";

function fakeDb(opts: { signalsSeen: number; trades: { mint: string; pnlSol?: number }[] }) {
  const countDocuments = vi.fn().mockResolvedValue(opts.signalsSeen);
  const toArray = vi.fn().mockResolvedValue(opts.trades);
  const find = vi.fn().mockReturnValue({ toArray });
  const collection = vi.fn().mockReturnValue({ countDocuments, find });
  return { db: { collection } as unknown as Db, find };
}

function fakeLogger(): Logger {
  return { warn: vi.fn(), info: vi.fn(), error: vi.fn() } as unknown as Logger;
}

describe("computeDailySummary", () => {
  it("computes win/loss counts and expectancy from trades in the period", async () => {
    const { db } = fakeDb({
      signalsSeen: 20,
      trades: [
        { mint, pnlSol: 0.05 },
        { mint, pnlSol: -0.02 },
        { mint, pnlSol: 0.01 },
      ],
    });

    const summary = await computeDailySummary(db, new Date(0), new Date(1));
    expect(summary.signalsSeen).toBe(20);
    expect(summary.tradesTaken).toBe(3);
    expect(summary.wins).toBe(2);
    expect(summary.losses).toBe(1);
    expect(summary.expectancySol).toBeCloseTo((0.05 - 0.02 + 0.01) / 3);
  });

  it("identifies the best and worst trade by pnl", async () => {
    const { db } = fakeDb({
      signalsSeen: 5,
      trades: [
        { mint: "best", pnlSol: 0.1 },
        { mint: "worst", pnlSol: -0.05 },
        { mint: "mid", pnlSol: 0.01 },
      ],
    });

    const summary = await computeDailySummary(db, new Date(0), new Date(1));
    expect(summary.bestTrade).toEqual({ mint: "best", pnlSol: 0.1 });
    expect(summary.worstTrade).toEqual({ mint: "worst", pnlSol: -0.05 });
  });

  it("handles a period with zero trades without dividing by zero", async () => {
    const { db } = fakeDb({ signalsSeen: 5, trades: [] });
    const summary = await computeDailySummary(db, new Date(0), new Date(1));
    expect(summary.tradesTaken).toBe(0);
    expect(summary.expectancySol).toBe(0);
    expect(summary.bestTrade).toBeUndefined();
  });

  it("treats a missing pnlSol as zero for win/loss classification", async () => {
    const { db } = fakeDb({ signalsSeen: 1, trades: [{ mint }] });
    const summary = await computeDailySummary(db, new Date(0), new Date(1));
    expect(summary.wins).toBe(0);
    expect(summary.losses).toBe(1);
  });
});

describe("DailySummaryScheduler", () => {
  function makeScheduler() {
    const sendMessage = vi.fn().mockResolvedValue(undefined);
    const telegram = { sendMessage } as unknown as TelegramClient;
    const { db } = fakeDb({ signalsSeen: 1, trades: [] });
    const scheduler = new DailySummaryScheduler(
      { db, telegram, chatId: "chat1", logger: fakeLogger() },
      9,
    );
    return { scheduler, sendMessage };
  }

  it("does not fire before the configured hour", async () => {
    const { scheduler, sendMessage } = makeScheduler();
    await scheduler.tick(new Date("2026-01-01T08:59:00.000Z"));
    expect(sendMessage).not.toHaveBeenCalled();
  });

  it("fires once at or after the configured hour", async () => {
    const { scheduler, sendMessage } = makeScheduler();
    await scheduler.tick(new Date("2026-01-01T09:00:00.000Z"));
    expect(sendMessage).toHaveBeenCalledTimes(1);
  });

  it("does not fire twice on the same calendar day", async () => {
    const { scheduler, sendMessage } = makeScheduler();
    await scheduler.tick(new Date("2026-01-01T09:00:00.000Z"));
    await scheduler.tick(new Date("2026-01-01T10:00:00.000Z"));
    expect(sendMessage).toHaveBeenCalledTimes(1);
  });

  it("fires again the next day", async () => {
    const { scheduler, sendMessage } = makeScheduler();
    await scheduler.tick(new Date("2026-01-01T09:00:00.000Z"));
    await scheduler.tick(new Date("2026-01-02T09:00:00.000Z"));
    expect(sendMessage).toHaveBeenCalledTimes(2);
  });
});
