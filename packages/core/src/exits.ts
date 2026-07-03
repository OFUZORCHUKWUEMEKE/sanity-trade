export interface RugSignal {
  devWalletSold: boolean;
  marketCapCollapse: boolean;
}

export interface ExitEvaluationInput {
  entryPrice: number;
  currentPrice: number;
  peakPriceSinceEntry: number;
  /** Fraction of the original position still open, in (0, 1]. */
  remainingFraction: number;
  tookInitialTakeProfit: boolean;
  rugSignal: RugSignal;
  takeProfitMultiple: number;
  takeProfitSellFraction: number;
  trailingStopPercent: number;
}

export type ExitAction = "hold" | "takeProfit" | "trailingStop" | "rugExit";

export interface ExitDecision {
  action: ExitAction;
  /** Fraction of the ORIGINAL position size to sell now. 0 when holding. */
  sellFraction: number;
  reason: string;
}

/**
 * Pure exit decision, evaluated in priority order:
 *   1. Rug trigger - dev wallet sell or a market-cap collapse (our proxy for
 *      LP pull / holder-count collapse) - exits the entire remaining
 *      position immediately, regardless of any other state.
 *   2. Laddered take-profit - sell takeProfitSellFraction of the ORIGINAL
 *      position the first time price reaches takeProfitMultiple x entry.
 *      Fires at most once per position.
 *   3. Trailing stop - once the position has ever been in profit (peak >
 *      entry), a pullback of trailingStopPercent from that peak exits
 *      whatever remains, whether or not take-profit has already fired.
 */
export function evaluateExit(input: ExitEvaluationInput): ExitDecision {
  if (input.rugSignal.devWalletSold || input.rugSignal.marketCapCollapse) {
    const reason = input.rugSignal.devWalletSold
      ? "rug trigger: dev wallet sold"
      : "rug trigger: market cap collapse";
    return { action: "rugExit", sellFraction: input.remainingFraction, reason };
  }

  if (!input.tookInitialTakeProfit && input.currentPrice >= input.entryPrice * input.takeProfitMultiple) {
    const sellFraction = Math.min(input.takeProfitSellFraction, input.remainingFraction);
    return {
      action: "takeProfit",
      sellFraction,
      reason: `take profit at ${input.takeProfitMultiple}x entry`,
    };
  }

  const everInProfit = input.peakPriceSinceEntry > input.entryPrice;
  if (everInProfit) {
    const drawdownFromPeak =
      (input.peakPriceSinceEntry - input.currentPrice) / input.peakPriceSinceEntry;
    if (drawdownFromPeak >= input.trailingStopPercent) {
      return {
        action: "trailingStop",
        sellFraction: input.remainingFraction,
        reason: `trailing stop: ${(drawdownFromPeak * 100).toFixed(1)}% pullback from peak`,
      };
    }
  }

  return { action: "hold", sellFraction: 0, reason: "no exit condition met" };
}
