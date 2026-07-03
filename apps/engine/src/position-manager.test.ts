import { describe, expect, it } from "vitest";
import { PositionManager } from "./position-manager.js";

const noRug = { devWalletSold: false, marketCapCollapse: false };
const now = new Date("2026-01-01T00:00:00.000Z");

function makeManager(overrides?: Partial<{ maxConcurrent: number }>) {
  return new PositionManager({
    maxConcurrent: overrides?.maxConcurrent ?? 3,
    takeProfitMultiple: 2,
    takeProfitSellFraction: 0.5,
    trailingStopPercent: 0.2,
  });
}

describe("PositionManager entry gating", () => {
  it("allows entering up to maxConcurrent positions", () => {
    const manager = makeManager({ maxConcurrent: 2 });
    expect(manager.enter("mintA", "dep", 1, 0.1, "score 80", now)).toBeDefined();
    expect(manager.enter("mintB", "dep", 1, 0.1, "score 80", now)).toBeDefined();
    expect(manager.canEnter("mintC")).toBe(false);
    expect(manager.enter("mintC", "dep", 1, 0.1, "score 80", now)).toBeUndefined();
    expect(manager.openCount).toBe(2);
  });

  it("refuses to open a second position in the same mint", () => {
    const manager = makeManager();
    manager.enter("mintA", "dep", 1, 0.1, "score 80", now);
    expect(manager.canEnter("mintA")).toBe(false);
    expect(manager.enter("mintA", "dep", 1, 0.1, "score 80", now)).toBeUndefined();
  });
});

describe("PositionManager.onPriceUpdate", () => {
  it("returns undefined (holds) for a mint with no open position", () => {
    const manager = makeManager();
    expect(manager.onPriceUpdate("mintA", 5, noRug, now)).toBeUndefined();
  });

  it("returns undefined while holding below the exit thresholds", () => {
    const manager = makeManager();
    manager.enter("mintA", "dep", 1, 0.1, "score 80", now);
    expect(manager.onPriceUpdate("mintA", 1.2, noRug, now)).toBeUndefined();
  });

  it("fires a partial take-profit at 2x, halving the position size and keeping it open", () => {
    const manager = makeManager();
    manager.enter("mintA", "dep", 1, 0.1, "score 80", now);

    const event = manager.onPriceUpdate("mintA", 2, noRug, now);
    expect(event?.action).toBe("takeProfit");
    expect(event?.sellSizeSol).toBeCloseTo(0.05);
    expect(event?.positionClosed).toBe(false);
    expect(manager.get("mintA")?.remainingSizeSol).toBeCloseTo(0.05);
  });

  it("closes the position and frees a concurrency slot on a trailing stop after take-profit", () => {
    const manager = makeManager({ maxConcurrent: 1 });
    manager.enter("mintA", "dep", 1, 0.1, "score 80", now);
    manager.onPriceUpdate("mintA", 2, noRug, now); // partial TP, remaining 0.05
    expect(manager.canEnter("mintB")).toBe(false);

    const event = manager.onPriceUpdate("mintA", 1.5, noRug, now); // pullback from peak 2
    expect(event?.action).toBe("trailingStop");
    expect(event?.sellSizeSol).toBeCloseTo(0.05);
    expect(event?.positionClosed).toBe(true);
    expect(manager.get("mintA")).toBeUndefined();
    expect(manager.canEnter("mintB")).toBe(true);
  });

  it("fully exits and closes on a rug signal regardless of price", () => {
    const manager = makeManager();
    manager.enter("mintA", "dep", 1, 0.1, "score 80", now);

    const event = manager.onPriceUpdate(
      "mintA",
      1.05,
      { devWalletSold: true, marketCapCollapse: false },
      now,
    );
    expect(event?.action).toBe("rugExit");
    expect(event?.sellSizeSol).toBeCloseTo(0.1);
    expect(event?.positionClosed).toBe(true);
    expect(manager.openCount).toBe(0);
  });

  it("preserves entry metadata (entryAt, entryPrice, entryReason) on the exit event", () => {
    const manager = makeManager();
    manager.enter("mintA", "dep", 1, 0.1, "score 91", now);

    const event = manager.onPriceUpdate("mintA", 2, noRug, now);
    expect(event?.entryPrice).toBe(1);
    expect(event?.entryAt).toEqual(now);
    expect(event?.entryReason).toBe("score 91");
  });
});
