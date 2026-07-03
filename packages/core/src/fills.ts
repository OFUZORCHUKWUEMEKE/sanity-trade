export type FillSide = "buy" | "sell";

export interface FillSimulationInput {
  side: FillSide;
  /** Quoted price before slippage, in SOL per token. */
  priceSol: number;
  /**
   * For a buy: SOL being spent. For a sell: the pre-slippage/fee SOL value
   * of the tokens being sold (tokenAmount * priceSol).
   */
  amountSol: number;
  /** e.g. 125 = 1.25%, matching Pump.fun's platform fee. */
  platformFeeBps: number;
  slippageBps: number;
  priorityFeeSol: number;
}

export interface FillSimulationResult {
  /** Price after applying the slippage model. */
  effectivePrice: number;
  grossSol: number;
  platformFeeSol: number;
  priorityFeeSol: number;
  slippageSol: number;
  /** Buy: total SOL cost (gross + fees). Sell: net SOL proceeds (gross - fees). */
  netSol: number;
}

/**
 * Simulates a fill with Pump.fun's platform fee, an estimated priority fee,
 * and a slippage model that always moves price against the trader (higher
 * for buys, lower for sells) - this is Phase 1's paper-trading cost model,
 * applied to every simulated entry/exit per CLAUDE.md.
 */
export function simulateFill(input: FillSimulationInput): FillSimulationResult {
  const slippageMultiplier =
    input.side === "buy" ? 1 + input.slippageBps / 10_000 : 1 - input.slippageBps / 10_000;
  const effectivePrice = input.priceSol * slippageMultiplier;
  const slippageSol = Math.abs(effectivePrice - input.priceSol) * (input.amountSol / input.priceSol);

  const platformFeeSol = input.amountSol * (input.platformFeeBps / 10_000);

  const netSol =
    input.side === "buy"
      ? input.amountSol + platformFeeSol + input.priorityFeeSol
      : input.amountSol - platformFeeSol - input.priorityFeeSol - slippageSol;

  return {
    effectivePrice,
    grossSol: input.amountSol,
    platformFeeSol,
    priorityFeeSol: input.priorityFeeSol,
    slippageSol,
    netSol,
  };
}
