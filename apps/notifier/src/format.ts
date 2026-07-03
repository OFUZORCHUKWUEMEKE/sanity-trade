import type { ScoreCheck } from "@memebot/db";

export interface TradeAlertInput {
  mint: string;
  entryAt: Date;
  entryPrice: number;
  exitAt: Date;
  exitPrice: number;
  sizeSol: number;
  pnlSol: number;
  entryReason: string;
  exitReason: string;
  simulatedFeesSol: number;
  simulatedSlippageSol: number;
  scoreBreakdown: ScoreCheck[] | undefined;
}

function pct(from: number, to: number): string {
  const change = ((to - from) / from) * 100;
  const sign = change >= 0 ? "+" : "";
  return `${sign}${change.toFixed(1)}%`;
}

export function formatTradeAlert(input: TradeAlertInput): string {
  const lines = [
    `*Paper trade closed*`,
    `Mint: \`${input.mint}\``,
    `Entry: ${input.entryPrice.toPrecision(4)} SOL -> Exit: ${input.exitPrice.toPrecision(4)} SOL (${pct(input.entryPrice, input.exitPrice)})`,
    `Size: ${input.sizeSol.toFixed(4)} SOL`,
    `PnL: ${input.pnlSol >= 0 ? "+" : ""}${input.pnlSol.toFixed(5)} SOL`,
    `Fees: ${input.simulatedFeesSol.toFixed(5)} SOL, Slippage: ${input.simulatedSlippageSol.toFixed(5)} SOL`,
    `Entry reason: ${input.entryReason}`,
    `Exit reason: ${input.exitReason}`,
  ];

  if (input.scoreBreakdown && input.scoreBreakdown.length > 0) {
    lines.push("Score breakdown:");
    for (const check of input.scoreBreakdown) {
      lines.push(`  - ${check.check}: ${check.score.toFixed(0)} (${check.reason})`);
    }
  }

  return lines.join("\n");
}

export interface DailySummaryInput {
  periodStart: Date;
  periodEnd: Date;
  signalsSeen: number;
  tradesTaken: number;
  wins: number;
  losses: number;
  expectancySol: number;
  bestTrade: { mint: string; pnlSol: number } | undefined;
  worstTrade: { mint: string; pnlSol: number } | undefined;
}

export function formatDailySummary(input: DailySummaryInput): string {
  const winRate = input.tradesTaken > 0 ? (input.wins / input.tradesTaken) * 100 : 0;

  const lines = [
    `*Daily summary*`,
    `${input.periodStart.toISOString().slice(0, 10)}`,
    `Signals seen: ${input.signalsSeen}`,
    `Trades taken: ${input.tradesTaken}`,
    `Win rate: ${winRate.toFixed(1)}% (${input.wins}W / ${input.losses}L)`,
    `Expectancy after fees: ${input.expectancySol >= 0 ? "+" : ""}${input.expectancySol.toFixed(5)} SOL/trade`,
  ];

  if (input.bestTrade) {
    lines.push(`Best: \`${input.bestTrade.mint}\` +${input.bestTrade.pnlSol.toFixed(5)} SOL`);
  }
  if (input.worstTrade) {
    lines.push(`Worst: \`${input.worstTrade.mint}\` ${input.worstTrade.pnlSol.toFixed(5)} SOL`);
  }

  return lines.join("\n");
}

export interface StatusInput {
  paperMode: boolean;
  paused: boolean;
  killed: boolean;
  openPositionCount: number;
  maxConcurrent: number;
}

export function formatStatus(input: StatusInput): string {
  const state = input.killed ? "KILLED" : input.paused ? "paused" : "running";
  return [
    `*Status*`,
    `Mode: ${input.paperMode ? "paper" : "REAL (not supported in Phase 1)"}`,
    `State: ${state}`,
    `Open positions: ${input.openPositionCount}/${input.maxConcurrent}`,
  ].join("\n");
}

export interface OpenPositionSummary {
  mint: string;
  entryPrice: number;
  remainingSizeSol: number;
  peakPriceSol: number;
  tookInitialTakeProfit: boolean;
}

export function formatPositions(positions: OpenPositionSummary[]): string {
  if (positions.length === 0) {
    return "*Positions*\nNo open positions.";
  }

  const lines = ["*Positions*"];
  for (const position of positions) {
    lines.push(
      `\`${position.mint}\`: entry ${position.entryPrice.toPrecision(4)} SOL, ` +
        `remaining ${position.remainingSizeSol.toFixed(4)} SOL, ` +
        `peak ${position.peakPriceSol.toPrecision(4)} SOL` +
        (position.tookInitialTakeProfit ? " (TP taken)" : ""),
    );
  }
  return lines.join("\n");
}
