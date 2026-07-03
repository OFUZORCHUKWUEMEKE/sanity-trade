import { describe, expect, it } from "vitest";
import { evaluateExit, type ExitEvaluationInput } from "./exits.js";

const base: ExitEvaluationInput = {
  entryPrice: 1,
  currentPrice: 1,
  peakPriceSinceEntry: 1,
  remainingFraction: 1,
  tookInitialTakeProfit: false,
  rugSignal: { devWalletSold: false, marketCapCollapse: false },
  takeProfitMultiple: 2,
  takeProfitSellFraction: 0.5,
  trailingStopPercent: 0.2,
};

describe("evaluateExit", () => {
  it("holds when no condition is met", () => {
    const result = evaluateExit({ ...base, currentPrice: 1.2, peakPriceSinceEntry: 1.2 });
    expect(result.action).toBe("hold");
    expect(result.sellFraction).toBe(0);
  });

  it("fires take-profit at exactly the configured multiple, selling the configured fraction", () => {
    const result = evaluateExit({ ...base, currentPrice: 2, peakPriceSinceEntry: 2 });
    expect(result.action).toBe("takeProfit");
    expect(result.sellFraction).toBe(0.5);
  });

  it("does not re-fire take-profit once already taken", () => {
    const result = evaluateExit({
      ...base,
      currentPrice: 3,
      peakPriceSinceEntry: 3,
      tookInitialTakeProfit: true,
      remainingFraction: 0.5,
    });
    expect(result.action).not.toBe("takeProfit");
  });

  it("caps the take-profit sell fraction at whatever remains", () => {
    const result = evaluateExit({
      ...base,
      currentPrice: 2,
      peakPriceSinceEntry: 2,
      remainingFraction: 0.3,
    });
    expect(result.action).toBe("takeProfit");
    expect(result.sellFraction).toBe(0.3);
  });

  it("does not trigger a trailing stop if price has never exceeded entry", () => {
    const result = evaluateExit({
      ...base,
      currentPrice: 0.5,
      peakPriceSinceEntry: 1,
    });
    expect(result.action).toBe("hold");
  });

  it("triggers a trailing stop after a pullback from a post-entry peak", () => {
    const result = evaluateExit({
      ...base,
      tookInitialTakeProfit: true,
      remainingFraction: 0.5,
      peakPriceSinceEntry: 2,
      currentPrice: 1.5, // 25% pullback from peak of 2, exceeds 20% threshold
    });
    expect(result.action).toBe("trailingStop");
    expect(result.sellFraction).toBe(0.5);
  });

  it("does not trigger a trailing stop below the configured pullback threshold", () => {
    const result = evaluateExit({
      ...base,
      tookInitialTakeProfit: true,
      remainingFraction: 0.5,
      peakPriceSinceEntry: 2,
      currentPrice: 1.9, // 5% pullback, below 20% threshold
    });
    expect(result.action).toBe("hold");
  });

  it("applies a trailing stop even before take-profit has fired, once ever in profit", () => {
    const result = evaluateExit({
      ...base,
      peakPriceSinceEntry: 1.8,
      currentPrice: 1.3, // pulled back >20% from the 1.8 peak, never hit the 2x TP level
    });
    expect(result.action).toBe("trailingStop");
    expect(result.sellFraction).toBe(1);
  });

  it("a rug trigger overrides take-profit and trailing stop regardless of price", () => {
    const result = evaluateExit({
      ...base,
      currentPrice: 3,
      peakPriceSinceEntry: 3,
      rugSignal: { devWalletSold: true, marketCapCollapse: false },
    });
    expect(result.action).toBe("rugExit");
    expect(result.sellFraction).toBe(base.remainingFraction);
    expect(result.reason).toContain("dev wallet sold");
  });

  it("reports a market-cap-collapse rug reason distinctly from a dev-wallet-sell reason", () => {
    const result = evaluateExit({
      ...base,
      rugSignal: { devWalletSold: false, marketCapCollapse: true },
    });
    expect(result.action).toBe("rugExit");
    expect(result.reason).toContain("market cap collapse");
  });

  it("a rug exit sells whatever fraction remains, not the original size", () => {
    const result = evaluateExit({
      ...base,
      remainingFraction: 0.25,
      rugSignal: { devWalletSold: true, marketCapCollapse: false },
    });
    expect(result.sellFraction).toBe(0.25);
  });
});
