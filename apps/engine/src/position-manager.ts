import { evaluateExit, type ExitAction, type RugSignal } from "@memebot/core";

export interface OpenPosition {
  mint: string;
  deployer: string;
  entryAt: Date;
  entryPrice: number;
  entryReason: string;
  originalSizeSol: number;
  remainingSizeSol: number;
  peakPriceSol: number;
  tookInitialTakeProfit: boolean;
}

export interface ExitEvent {
  mint: string;
  action: Exclude<ExitAction, "hold">;
  reason: string;
  sellSizeSol: number;
  exitPrice: number;
  positionClosed: boolean;
  entryAt: Date;
  entryPrice: number;
  entryReason: string;
}

export interface PositionManagerOptions {
  maxConcurrent: number;
  takeProfitMultiple: number;
  takeProfitSellFraction: number;
  trailingStopPercent: number;
}

/** Stateful wrapper around the pure evaluateExit() decision, tracking open
 * paper positions (max N concurrent, per CLAUDE.md's risk rules). */
export class PositionManager {
  private readonly positions = new Map<string, OpenPosition>();

  constructor(private readonly opts: PositionManagerOptions) {}

  canEnter(mint: string): boolean {
    return !this.positions.has(mint) && this.positions.size < this.opts.maxConcurrent;
  }

  enter(
    mint: string,
    deployer: string,
    entryPrice: number,
    sizeSol: number,
    reason: string,
    now: Date,
  ): OpenPosition | undefined {
    if (!this.canEnter(mint)) return undefined;

    const position: OpenPosition = {
      mint,
      deployer,
      entryAt: now,
      entryPrice,
      entryReason: reason,
      originalSizeSol: sizeSol,
      remainingSizeSol: sizeSol,
      peakPriceSol: entryPrice,
      tookInitialTakeProfit: false,
    };
    this.positions.set(mint, position);
    return position;
  }

  get(mint: string): OpenPosition | undefined {
    return this.positions.get(mint);
  }

  get openCount(): number {
    return this.positions.size;
  }

  onPriceUpdate(
    mint: string,
    currentPrice: number,
    rugSignal: RugSignal,
    now: Date = new Date(),
  ): ExitEvent | undefined {
    const position = this.positions.get(mint);
    if (!position) return undefined;

    position.peakPriceSol = Math.max(position.peakPriceSol, currentPrice);

    const decision = evaluateExit({
      entryPrice: position.entryPrice,
      currentPrice,
      peakPriceSinceEntry: position.peakPriceSol,
      remainingFraction: position.remainingSizeSol / position.originalSizeSol,
      tookInitialTakeProfit: position.tookInitialTakeProfit,
      rugSignal,
      takeProfitMultiple: this.opts.takeProfitMultiple,
      takeProfitSellFraction: this.opts.takeProfitSellFraction,
      trailingStopPercent: this.opts.trailingStopPercent,
    });

    if (decision.action === "hold") return undefined;

    const sellSizeSol = Math.min(
      decision.sellFraction * position.originalSizeSol,
      position.remainingSizeSol,
    );
    position.remainingSizeSol = Math.max(0, position.remainingSizeSol - sellSizeSol);
    if (decision.action === "takeProfit") {
      position.tookInitialTakeProfit = true;
    }

    const positionClosed = position.remainingSizeSol <= 1e-9;
    const event: ExitEvent = {
      mint,
      action: decision.action,
      reason: decision.reason,
      sellSizeSol,
      exitPrice: currentPrice,
      positionClosed,
      entryAt: position.entryAt,
      entryPrice: position.entryPrice,
      entryReason: position.entryReason,
    };

    if (positionClosed) {
      this.positions.delete(mint);
    }

    return event;
  }
}
