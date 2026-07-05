import { describe, expect, it } from "vitest";
import { renderMarkdownReport, type ReportInput } from "./report.js";

const baseInput: ReportInput = {
  generatedAt: new Date("2026-01-15T00:00:00.000Z"),
  dataRange: {
    earliest: new Date("2026-01-01T00:00:00.000Z"),
    latest: new Date("2026-01-15T00:00:00.000Z"),
  },
  signalsSeen: 150,
  expectancy: {
    tradesTaken: 20,
    wins: 12,
    losses: 8,
    winRate: 0.6,
    totalPnlSol: 0.1,
    expectancySol: 0.005,
  },
  exitBreakdown: {
    takeProfit: 10,
    trailingStop: 6,
    "rugExit:devWalletSold": 2,
    "rugExit:marketCapCollapse": 2,
    unknown: 0,
  },
  pnlByHour: Array.from({ length: 24 }, (_, hour) => ({
    hour,
    count: hour === 9 ? 5 : 0,
    totalPnlSol: hour === 9 ? 0.05 : 0,
    avgPnlSol: hour === 9 ? 0.01 : 0,
  })),
  checkSeparation: [
    { check: "mintAuthority", winnerAvgScore: 95, loserAvgScore: 40, diff: 55, winnerCount: 12, loserCount: 8 },
  ],
  exitGateMinSignals: 100,
  exitGateMinDays: 14,
};

describe("renderMarkdownReport", () => {
  it("reports PASS when every exit-gate criterion is met", () => {
    const text = renderMarkdownReport(baseInput);
    expect(text).toContain("PASS - ready to consider Phase 2");
    expect(text).toContain("| Signals seen | >= 100 | 150 | PASS |");
    expect(text).toContain("| Expectancy after fees | > 0 SOL | 0.00500 SOL | PASS |");
  });

  it("reports FAIL when expectancy is negative, even if other criteria pass", () => {
    const text = renderMarkdownReport({
      ...baseInput,
      expectancy: { ...baseInput.expectancy, expectancySol: -0.001 },
    });
    expect(text).toContain("FAIL - keep collecting paper trading data");
    expect(text).toContain("Expectancy after fees | > 0 SOL | -0.00100 SOL | FAIL");
  });

  it("reports FAIL when not enough signals have been seen yet", () => {
    const text = renderMarkdownReport({ ...baseInput, signalsSeen: 10 });
    expect(text).toContain("| Signals seen | >= 100 | 10 | FAIL |");
    expect(text).toContain("FAIL - keep collecting paper trading data");
  });

  it("computes days of data from the earliest/latest score timestamps", () => {
    const text = renderMarkdownReport(baseInput);
    expect(text).toContain("| Days of data | >= 14 | 14.0 | PASS |");
  });

  it("reports 0 days of data when the range is unknown", () => {
    const text = renderMarkdownReport({
      ...baseInput,
      dataRange: { earliest: undefined, latest: undefined },
    });
    expect(text).toContain("| Days of data | >= 14 | 0.0 |");
  });

  it("only lists hours with at least one trade", () => {
    const text = renderMarkdownReport(baseInput);
    expect(text).toContain("| 09:00 | 5 | 0.05000 | 0.01000 |");
    expect(text).not.toContain("| 00:00 |");
  });

  it("notes there are no trades yet when every hour bucket is empty", () => {
    const text = renderMarkdownReport({
      ...baseInput,
      pnlByHour: baseInput.pnlByHour.map((b) => ({ ...b, count: 0, totalPnlSol: 0, avgPnlSol: 0 })),
    });
    expect(text).toContain("No trades yet.");
  });

  it("notes there is no matched-score data when checkSeparation is empty", () => {
    const text = renderMarkdownReport({ ...baseInput, checkSeparation: [] });
    expect(text).toContain("No trades with a matched score yet.");
  });

  it("includes every exit-rule bucket in the breakdown table", () => {
    const text = renderMarkdownReport(baseInput);
    expect(text).toContain("| takeProfit | 10 |");
    expect(text).toContain("| trailingStop | 6 |");
    expect(text).toContain("| rugExit:devWalletSold | 2 |");
  });
});
