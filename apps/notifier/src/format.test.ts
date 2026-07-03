import { describe, expect, it } from "vitest";
import {
  formatDailySummary,
  formatPositions,
  formatStatus,
  formatTradeAlert,
  type DailySummaryInput,
  type TradeAlertInput,
} from "./format.js";

const mint = "So11111111111111111111111111111111111111112";
const entryAt = new Date("2026-01-01T00:00:00.000Z");
const exitAt = new Date("2026-01-01T00:05:00.000Z");

const baseTrade: TradeAlertInput = {
  mint,
  entryAt,
  entryPrice: 0.0001,
  exitAt,
  exitPrice: 0.0002,
  sizeSol: 0.05,
  pnlSol: 0.02,
  entryReason: "score 91.0",
  exitReason: "take profit at 2x entry",
  simulatedFeesSol: 0.001,
  simulatedSlippageSol: 0.0005,
  scoreBreakdown: [
    { check: "mintAuthority", score: 100, reason: "revoked", hardReject: false },
  ],
};

describe("formatTradeAlert", () => {
  it("includes mint, price move, size, and pnl", () => {
    const text = formatTradeAlert(baseTrade);
    expect(text).toContain(mint);
    expect(text).toContain("+100.0%");
    expect(text).toContain("Size: 0.0500 SOL");
    expect(text).toContain("PnL: +0.02000 SOL");
  });

  it("includes the score breakdown when present", () => {
    const text = formatTradeAlert(baseTrade);
    expect(text).toContain("mintAuthority: 100 (revoked)");
  });

  it("omits the score breakdown section when absent", () => {
    const text = formatTradeAlert({ ...baseTrade, scoreBreakdown: undefined });
    expect(text).not.toContain("Score breakdown");
  });

  it("shows a negative pnl without a leading plus sign", () => {
    const text = formatTradeAlert({ ...baseTrade, pnlSol: -0.01 });
    expect(text).toContain("-0.01000 SOL");
    expect(text).not.toContain("+-0.01000");
  });
});

const baseSummary: DailySummaryInput = {
  periodStart: entryAt,
  periodEnd: exitAt,
  signalsSeen: 42,
  tradesTaken: 10,
  wins: 6,
  losses: 4,
  expectancySol: 0.001,
  bestTrade: { mint, pnlSol: 0.05 },
  worstTrade: { mint, pnlSol: -0.02 },
};

describe("formatDailySummary", () => {
  it("computes win rate from wins and trades taken", () => {
    const text = formatDailySummary(baseSummary);
    expect(text).toContain("60.0% (6W / 4L)");
  });

  it("reports 0% win rate when no trades were taken, without dividing by zero", () => {
    const text = formatDailySummary({ ...baseSummary, tradesTaken: 0, wins: 0, losses: 0 });
    expect(text).toContain("0.0% (0W / 0L)");
  });

  it("includes best and worst trades when present", () => {
    const text = formatDailySummary(baseSummary);
    expect(text).toContain("Best");
    expect(text).toContain("Worst");
  });

  it("omits best/worst lines when there were no trades", () => {
    const text = formatDailySummary({
      ...baseSummary,
      tradesTaken: 0,
      bestTrade: undefined,
      worstTrade: undefined,
    });
    expect(text).not.toContain("Best");
    expect(text).not.toContain("Worst");
  });
});

describe("formatStatus", () => {
  it("reports running state when neither paused nor killed", () => {
    const text = formatStatus({
      paperMode: true,
      paused: false,
      killed: false,
      openPositionCount: 2,
      maxConcurrent: 3,
    });
    expect(text).toContain("State: running");
    expect(text).toContain("2/3");
  });

  it("reports KILLED taking priority over paused", () => {
    const text = formatStatus({
      paperMode: true,
      paused: true,
      killed: true,
      openPositionCount: 0,
      maxConcurrent: 3,
    });
    expect(text).toContain("State: KILLED");
  });
});

describe("formatPositions", () => {
  it("reports no open positions when the list is empty", () => {
    expect(formatPositions([])).toContain("No open positions");
  });

  it("lists each position with its remaining size", () => {
    const text = formatPositions([
      {
        mint,
        entryPrice: 0.0001,
        remainingSizeSol: 0.05,
        peakPriceSol: 0.0002,
        tookInitialTakeProfit: true,
      },
    ]);
    expect(text).toContain(mint);
    expect(text).toContain("0.0500 SOL");
    expect(text).toContain("TP taken");
  });
});
