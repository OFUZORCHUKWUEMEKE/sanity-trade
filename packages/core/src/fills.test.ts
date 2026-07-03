import { describe, expect, it } from "vitest";
import { simulateFill } from "./fills.js";

describe("simulateFill", () => {
  it("applies platform fee and priority fee on top of amount for a buy", () => {
    const result = simulateFill({
      side: "buy",
      priceSol: 0.0001,
      amountSol: 0.1,
      platformFeeBps: 125,
      slippageBps: 0,
      priorityFeeSol: 0.0005,
    });

    expect(result.platformFeeSol).toBeCloseTo(0.00125);
    expect(result.netSol).toBeCloseTo(0.1 + 0.00125 + 0.0005);
  });

  it("moves the effective price up for a buy under slippage", () => {
    const result = simulateFill({
      side: "buy",
      priceSol: 0.0001,
      amountSol: 0.1,
      platformFeeBps: 0,
      slippageBps: 100, // 1%
      priorityFeeSol: 0,
    });

    expect(result.effectivePrice).toBeCloseTo(0.0001 * 1.01);
  });

  it("moves the effective price down for a sell under slippage", () => {
    const result = simulateFill({
      side: "sell",
      priceSol: 0.0001,
      amountSol: 0.1,
      platformFeeBps: 0,
      slippageBps: 100,
      priorityFeeSol: 0,
    });

    expect(result.effectivePrice).toBeCloseTo(0.0001 * 0.99);
  });

  it("subtracts fees and slippage from proceeds on a sell", () => {
    const result = simulateFill({
      side: "sell",
      priceSol: 0.0001,
      amountSol: 0.1,
      platformFeeBps: 125,
      slippageBps: 100,
      priorityFeeSol: 0.0005,
    });

    expect(result.netSol).toBeCloseTo(
      0.1 - result.platformFeeSol - result.priorityFeeSol - result.slippageSol,
    );
    expect(result.netSol).toBeLessThan(result.grossSol);
  });

  it("reports zero slippage cost when slippageBps is 0", () => {
    const result = simulateFill({
      side: "buy",
      priceSol: 0.0001,
      amountSol: 0.1,
      platformFeeBps: 0,
      slippageBps: 0,
      priorityFeeSol: 0,
    });
    expect(result.slippageSol).toBe(0);
    expect(result.netSol).toBeCloseTo(0.1);
  });
});
