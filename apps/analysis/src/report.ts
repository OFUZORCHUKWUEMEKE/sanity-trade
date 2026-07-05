import type { CheckSeparation, ExitBucket, ExpectancyStats, HourBucket } from "./stats.js";

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

export interface ReportInput {
  generatedAt: Date;
  dataRange: { earliest: Date | undefined; latest: Date | undefined };
  signalsSeen: number;
  expectancy: ExpectancyStats;
  exitBreakdown: Record<ExitBucket, number>;
  pnlByHour: HourBucket[];
  checkSeparation: CheckSeparation[];
  exitGateMinSignals: number;
  exitGateMinDays: number;
}

function daysOfData(input: ReportInput): number {
  if (!input.dataRange.earliest || !input.dataRange.latest) return 0;
  return (input.dataRange.latest.getTime() - input.dataRange.earliest.getTime()) / ONE_DAY_MS;
}

function checkmark(pass: boolean): string {
  return pass ? "PASS" : "FAIL";
}

/**
 * Renders the Phase 1 paper-trading report: the exit-gate verdict (>=2
 * weeks of data, >=100 signals, positive expectancy after fees, per
 * CLAUDE.md) plus the supporting breakdowns that explain *why*.
 */
export function renderMarkdownReport(input: ReportInput): string {
  const days = daysOfData(input);
  const gateSignals = input.signalsSeen >= input.exitGateMinSignals;
  const gateDays = days >= input.exitGateMinDays;
  const gateExpectancy = input.expectancy.expectancySol > 0;
  const overallPass = gateSignals && gateDays && gateExpectancy;

  const lines: string[] = [
    "# Phase 1 Paper Trading Report",
    "",
    `Generated: ${input.generatedAt.toISOString()}`,
    "",
    "## Phase 1 exit gate",
    "",
    "| Criterion | Threshold | Actual | Result |",
    "|---|---|---|---|",
    `| Signals seen | >= ${input.exitGateMinSignals} | ${input.signalsSeen} | ${checkmark(gateSignals)} |`,
    `| Days of data | >= ${input.exitGateMinDays} | ${days.toFixed(1)} | ${checkmark(gateDays)} |`,
    `| Expectancy after fees | > 0 SOL | ${input.expectancy.expectancySol.toFixed(5)} SOL | ${checkmark(gateExpectancy)} |`,
    "",
    `**Overall: ${overallPass ? "PASS - ready to consider Phase 2" : "FAIL - keep collecting paper trading data"}**`,
    "",
    "## Expectancy & win rate",
    "",
    `- Trades taken: ${input.expectancy.tradesTaken}`,
    `- Win rate: ${(input.expectancy.winRate * 100).toFixed(1)}% (${input.expectancy.wins}W / ${input.expectancy.losses}L)`,
    `- Total PnL: ${input.expectancy.totalPnlSol.toFixed(5)} SOL`,
    `- Expectancy per trade (after simulated fees + slippage): ${input.expectancy.expectancySol.toFixed(5)} SOL`,
    "",
    "## Exit rule breakdown",
    "",
    "| Exit rule | Count |",
    "|---|---|",
    ...Object.entries(input.exitBreakdown).map(([bucket, count]) => `| ${bucket} | ${count} |`),
    "",
    "## PnL by hour of day (UTC)",
    "",
  ];

  const activeHours = input.pnlByHour.filter((b) => b.count > 0);
  if (activeHours.length === 0) {
    lines.push("No trades yet.");
  } else {
    lines.push(
      "| Hour | Trades | Total PnL (SOL) | Avg PnL (SOL) |",
      "|---|---|---|---|",
      ...activeHours.map(
        (b) =>
          `| ${String(b.hour).padStart(2, "0")}:00 | ${b.count} | ${b.totalPnlSol.toFixed(5)} | ${b.avgPnlSol.toFixed(5)} |`,
      ),
    );
  }

  lines.push("", "## Which checks best separate winners from losers", "");

  if (input.checkSeparation.length === 0) {
    lines.push("No trades with a matched score yet.");
  } else {
    lines.push(
      "| Check | Winner avg score | Loser avg score | Diff | Sample (W/L) |",
      "|---|---|---|---|---|",
      ...input.checkSeparation.map(
        (c) =>
          `| ${c.check} | ${c.winnerAvgScore.toFixed(1)} | ${c.loserAvgScore.toFixed(1)} | ${c.diff >= 0 ? "+" : ""}${c.diff.toFixed(1)} | ${c.winnerCount}/${c.loserCount} |`,
      ),
    );
  }

  return lines.join("\n") + "\n";
}
