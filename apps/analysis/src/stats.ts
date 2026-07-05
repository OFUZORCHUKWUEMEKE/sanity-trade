import type { PaperTradeDoc, TokenScoreDoc } from "@memebot/db";

export interface ExpectancyStats {
  tradesTaken: number;
  wins: number;
  losses: number;
  winRate: number;
  totalPnlSol: number;
  expectancySol: number;
}

export function computeExpectancy(trades: PaperTradeDoc[]): ExpectancyStats {
  const tradesTaken = trades.length;
  const wins = trades.filter((t) => (t.pnlSol ?? 0) > 0).length;
  const losses = tradesTaken - wins;
  const totalPnlSol = trades.reduce((sum, t) => sum + (t.pnlSol ?? 0), 0);

  return {
    tradesTaken,
    wins,
    losses,
    winRate: tradesTaken > 0 ? wins / tradesTaken : 0,
    totalPnlSol,
    expectancySol: tradesTaken > 0 ? totalPnlSol / tradesTaken : 0,
  };
}

export type ExitBucket = "takeProfit" | "trailingStop" | "rugExit:devWalletSold" | "rugExit:marketCapCollapse" | "unknown";

export function classifyExitReason(reason: string | undefined): ExitBucket {
  if (!reason) return "unknown";
  if (reason.startsWith("take profit")) return "takeProfit";
  if (reason.startsWith("trailing stop")) return "trailingStop";
  if (reason.startsWith("rug trigger: dev wallet")) return "rugExit:devWalletSold";
  if (reason.startsWith("rug trigger: market cap")) return "rugExit:marketCapCollapse";
  return "unknown";
}

export function computeExitReasonBreakdown(trades: PaperTradeDoc[]): Record<ExitBucket, number> {
  const breakdown: Record<ExitBucket, number> = {
    takeProfit: 0,
    trailingStop: 0,
    "rugExit:devWalletSold": 0,
    "rugExit:marketCapCollapse": 0,
    unknown: 0,
  };
  for (const trade of trades) {
    breakdown[classifyExitReason(trade.exitReason)]++;
  }
  return breakdown;
}

export interface HourBucket {
  hour: number;
  count: number;
  totalPnlSol: number;
  avgPnlSol: number;
}

export function computePnlByHour(trades: PaperTradeDoc[]): HourBucket[] {
  const buckets: HourBucket[] = Array.from({ length: 24 }, (_, hour) => ({
    hour,
    count: 0,
    totalPnlSol: 0,
    avgPnlSol: 0,
  }));

  for (const trade of trades) {
    const bucket = buckets[trade.entryAt.getUTCHours()];
    if (!bucket) continue;
    bucket.count++;
    bucket.totalPnlSol += trade.pnlSol ?? 0;
  }

  for (const bucket of buckets) {
    bucket.avgPnlSol = bucket.count > 0 ? bucket.totalPnlSol / bucket.count : 0;
  }

  return buckets;
}

export interface JoinedTrade {
  trade: PaperTradeDoc;
  score: TokenScoreDoc | undefined;
}

/** Matches each trade to the most recent score taken at or before its entry
 * time for the same mint - the score that actually informed the entry. */
export function joinTradesWithScores(trades: PaperTradeDoc[], scores: TokenScoreDoc[]): JoinedTrade[] {
  const scoresByMint = new Map<string, TokenScoreDoc[]>();
  for (const score of scores) {
    const bucket = scoresByMint.get(score.mint);
    if (bucket) {
      bucket.push(score);
    } else {
      scoresByMint.set(score.mint, [score]);
    }
  }

  return trades.map((trade) => {
    const candidates = scoresByMint.get(trade.mint) ?? [];
    let best: TokenScoreDoc | undefined;
    for (const candidate of candidates) {
      if (candidate.checkedAt <= trade.entryAt && (!best || candidate.checkedAt > best.checkedAt)) {
        best = candidate;
      }
    }
    return { trade, score: best };
  });
}

export interface CheckSeparation {
  check: string;
  winnerAvgScore: number;
  loserAvgScore: number;
  diff: number;
  winnerCount: number;
  loserCount: number;
}

function average(values: number[]): number {
  return values.length > 0 ? values.reduce((sum, v) => sum + v, 0) / values.length : 0;
}

/**
 * For each named check (mintAuthority, deployerHistory, ...), compares the
 * average score winners had at entry vs the average score losers had. A
 * larger |diff| means that check's score more strongly predicted whether
 * the trade ended up a winner - this is what "is the moat working" looks
 * like in the data.
 */
export function computeCheckSeparation(joined: JoinedTrade[]): CheckSeparation[] {
  const winnerScores = new Map<string, number[]>();
  const loserScores = new Map<string, number[]>();

  for (const { trade, score } of joined) {
    if (!score) continue;
    const target = (trade.pnlSol ?? 0) > 0 ? winnerScores : loserScores;
    for (const check of score.checks) {
      const bucket = target.get(check.check);
      if (bucket) {
        bucket.push(check.score);
      } else {
        target.set(check.check, [check.score]);
      }
    }
  }

  const checkNames = new Set([...winnerScores.keys(), ...loserScores.keys()]);
  const results: CheckSeparation[] = [];
  for (const check of checkNames) {
    const winners = winnerScores.get(check) ?? [];
    const losers = loserScores.get(check) ?? [];
    const winnerAvgScore = average(winners);
    const loserAvgScore = average(losers);
    results.push({
      check,
      winnerAvgScore,
      loserAvgScore,
      diff: winnerAvgScore - loserAvgScore,
      winnerCount: winners.length,
      loserCount: losers.length,
    });
  }

  return results.sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff));
}
