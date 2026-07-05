import type { PaperTradeDoc, TokenScoreDoc } from "@memebot/db";
import { describe, expect, it } from "vitest";
import {
  classifyExitReason,
  computeCheckSeparation,
  computeExitReasonBreakdown,
  computeExpectancy,
  computePnlByHour,
  joinTradesWithScores,
} from "./stats.js";

const mintA = "So11111111111111111111111111111111111111112";
const mintB = "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM";

function trade(overrides?: Partial<PaperTradeDoc>): PaperTradeDoc {
  return {
    mint: mintA,
    entryAt: new Date("2026-01-01T09:00:00.000Z"),
    entryPrice: 0.0001,
    exitAt: new Date("2026-01-01T09:05:00.000Z"),
    exitPrice: 0.0002,
    sizeSol: 0.05,
    pnlSol: 0.02,
    entryReason: "score 91.0",
    exitReason: "take profit at 2x entry",
    simulatedFeesSol: 0.001,
    simulatedSlippageSol: 0.0005,
    ...overrides,
  };
}

describe("computeExpectancy", () => {
  it("computes win rate, total pnl, and expectancy", () => {
    const stats = computeExpectancy([
      trade({ pnlSol: 0.05 }),
      trade({ pnlSol: -0.02 }),
      trade({ pnlSol: 0.01 }),
    ]);
    expect(stats.tradesTaken).toBe(3);
    expect(stats.wins).toBe(2);
    expect(stats.losses).toBe(1);
    expect(stats.winRate).toBeCloseTo(2 / 3);
    expect(stats.totalPnlSol).toBeCloseTo(0.04);
    expect(stats.expectancySol).toBeCloseTo(0.04 / 3);
  });

  it("handles an empty trade list without dividing by zero", () => {
    const stats = computeExpectancy([]);
    expect(stats.winRate).toBe(0);
    expect(stats.expectancySol).toBe(0);
  });

  it("treats a missing pnlSol as a loss of zero", () => {
    const { pnlSol: _pnlSol, ...rest } = trade();
    const stats = computeExpectancy([rest as PaperTradeDoc]);
    expect(stats.wins).toBe(0);
    expect(stats.losses).toBe(1);
  });
});

describe("classifyExitReason", () => {
  it("classifies each known reason prefix", () => {
    expect(classifyExitReason("take profit at 2x entry")).toBe("takeProfit");
    expect(classifyExitReason("trailing stop: 25.0% pullback from peak")).toBe("trailingStop");
    expect(classifyExitReason("rug trigger: dev wallet sold")).toBe("rugExit:devWalletSold");
    expect(classifyExitReason("rug trigger: market cap collapse")).toBe("rugExit:marketCapCollapse");
  });

  it("returns unknown for an unrecognized or missing reason", () => {
    expect(classifyExitReason("something else")).toBe("unknown");
    expect(classifyExitReason(undefined)).toBe("unknown");
  });
});

describe("computeExitReasonBreakdown", () => {
  it("counts trades per classified exit bucket", () => {
    const breakdown = computeExitReasonBreakdown([
      trade({ exitReason: "take profit at 2x entry" }),
      trade({ exitReason: "take profit at 2x entry" }),
      trade({ exitReason: "trailing stop: 25% pullback from peak" }),
      trade({ exitReason: "rug trigger: dev wallet sold" }),
    ]);
    expect(breakdown.takeProfit).toBe(2);
    expect(breakdown.trailingStop).toBe(1);
    expect(breakdown["rugExit:devWalletSold"]).toBe(1);
    expect(breakdown["rugExit:marketCapCollapse"]).toBe(0);
  });
});

describe("computePnlByHour", () => {
  it("buckets trades into 24 UTC hours with count and avg pnl", () => {
    const buckets = computePnlByHour([
      trade({ entryAt: new Date("2026-01-01T09:15:00.000Z"), pnlSol: 0.02 }),
      trade({ entryAt: new Date("2026-01-01T09:45:00.000Z"), pnlSol: 0.04 }),
      trade({ entryAt: new Date("2026-01-01T14:00:00.000Z"), pnlSol: -0.01 }),
    ]);
    expect(buckets).toHaveLength(24);
    expect(buckets[9]).toMatchObject({ count: 2, totalPnlSol: 0.06, avgPnlSol: 0.03 });
    expect(buckets[14]).toMatchObject({ count: 1, totalPnlSol: -0.01 });
    expect(buckets[0]).toMatchObject({ count: 0, avgPnlSol: 0 });
  });
});

function scoreDoc(overrides?: Partial<TokenScoreDoc>): TokenScoreDoc {
  return {
    mint: mintA,
    checkedAt: new Date("2026-01-01T08:59:00.000Z"),
    checks: [
      { check: "mintAuthority", score: 100, reason: "revoked", hardReject: false },
      { check: "curveVelocity", score: 50, reason: "moderate", hardReject: false },
    ],
    total: 75,
    hardRejected: false,
    reasons: [],
    ...overrides,
  };
}

describe("joinTradesWithScores", () => {
  it("matches a trade to the most recent same-mint score at or before entry", () => {
    const earlyScore = scoreDoc({ checkedAt: new Date("2026-01-01T08:00:00.000Z") });
    const closestScore = scoreDoc({ checkedAt: new Date("2026-01-01T08:59:00.000Z") });
    const futureScore = scoreDoc({ checkedAt: new Date("2026-01-01T09:30:00.000Z") });

    const joined = joinTradesWithScores([trade()], [earlyScore, closestScore, futureScore]);
    expect(joined[0]!.score).toBe(closestScore);
  });

  it("leaves score undefined when no score exists for that mint", () => {
    const joined = joinTradesWithScores([trade({ mint: mintB })], [scoreDoc({ mint: mintA })]);
    expect(joined[0]!.score).toBeUndefined();
  });

  it("leaves score undefined when the only scores are after entry time", () => {
    const futureScore = scoreDoc({ checkedAt: new Date("2026-01-01T10:00:00.000Z") });
    const joined = joinTradesWithScores([trade()], [futureScore]);
    expect(joined[0]!.score).toBeUndefined();
  });
});

describe("computeCheckSeparation", () => {
  it("computes winner/loser average score and diff per check", () => {
    const winnerScore = scoreDoc({
      checks: [{ check: "mintAuthority", score: 100, reason: "", hardReject: false }],
    });
    const loserScore = scoreDoc({
      mint: mintB,
      checks: [{ check: "mintAuthority", score: 20, reason: "", hardReject: false }],
    });

    const joined = joinTradesWithScores(
      [trade({ pnlSol: 0.05 }), trade({ mint: mintB, pnlSol: -0.03 })],
      [winnerScore, loserScore],
    );

    const separation = computeCheckSeparation(joined);
    const mintAuthority = separation.find((s) => s.check === "mintAuthority");
    expect(mintAuthority?.winnerAvgScore).toBe(100);
    expect(mintAuthority?.loserAvgScore).toBe(20);
    expect(mintAuthority?.diff).toBe(80);
  });

  it("sorts results by absolute separation, strongest first", () => {
    const winnerScore = scoreDoc({
      checks: [
        { check: "strongSignal", score: 100, reason: "", hardReject: false },
        { check: "weakSignal", score: 55, reason: "", hardReject: false },
      ],
    });
    const loserScore = scoreDoc({
      mint: mintB,
      checks: [
        { check: "strongSignal", score: 10, reason: "", hardReject: false },
        { check: "weakSignal", score: 50, reason: "", hardReject: false },
      ],
    });

    const joined = joinTradesWithScores(
      [trade({ pnlSol: 0.05 }), trade({ mint: mintB, pnlSol: -0.03 })],
      [winnerScore, loserScore],
    );
    const separation = computeCheckSeparation(joined);
    expect(separation[0]!.check).toBe("strongSignal");
  });

  it("ignores trades with no matched score", () => {
    const joined = joinTradesWithScores([trade()], []);
    expect(computeCheckSeparation(joined)).toEqual([]);
  });
});
