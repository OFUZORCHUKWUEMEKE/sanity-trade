import { simulateFill, type NormalizedEvent } from "@memebot/core";
import { paperTradesCollection, type Db } from "@memebot/db";
import type { Logger } from "pino";
import { PositionManager, type ExitEvent } from "./position-manager.js";

interface EntryFill {
  feeSol: number;
  slippageSol: number;
  originalSizeSol: number;
  netCostSol: number;
}

interface RugState {
  devWalletSold: boolean;
  peakMarketCapSol: number;
}

export interface PaperTraderOptions {
  db: Db;
  logger: Logger;
  positionSizeSol: number;
  maxConcurrent: number;
  entryScoreThreshold: number;
  takeProfitMultiple: number;
  takeProfitSellFraction: number;
  trailingStopPercent: number;
  marketCapCollapseDrawdown: number;
  platformFeeBps: number;
  slippageBps: number;
  priorityFeeSol: number;
}

/**
 * Paper-trades on score results: enters a simulated position when a token
 * clears the entry threshold and a concurrency slot is free, marks
 * open positions to market on every trade for that mint, and closes
 * (partially or fully) through PositionManager's exit decisions -
 * persisting one paper_trades row per fill.
 */
export class PaperTrader {
  private readonly positionManager: PositionManager;
  private readonly entryFills = new Map<string, EntryFill>();
  private readonly rugState = new Map<string, RugState>();

  constructor(private readonly opts: PaperTraderOptions) {
    this.positionManager = new PositionManager({
      maxConcurrent: opts.maxConcurrent,
      takeProfitMultiple: opts.takeProfitMultiple,
      takeProfitSellFraction: opts.takeProfitSellFraction,
      trailingStopPercent: opts.trailingStopPercent,
    });
  }

  tryEnter(
    mint: string,
    deployer: string,
    total: number,
    hardRejected: boolean,
    priceSol: number | undefined,
    marketCapSol: number | undefined,
    now: Date = new Date(),
  ): void {
    if (hardRejected || total < this.opts.entryScoreThreshold) return;
    if (!priceSol || priceSol <= 0) return;
    if (!this.positionManager.canEnter(mint)) return;

    const fill = simulateFill({
      side: "buy",
      priceSol,
      amountSol: this.opts.positionSizeSol,
      platformFeeBps: this.opts.platformFeeBps,
      slippageBps: this.opts.slippageBps,
      priorityFeeSol: this.opts.priorityFeeSol,
    });

    const position = this.positionManager.enter(
      mint,
      deployer,
      priceSol,
      this.opts.positionSizeSol,
      `score ${total.toFixed(1)}`,
      now,
    );
    if (!position) return;

    this.entryFills.set(mint, {
      feeSol: fill.platformFeeSol + fill.priorityFeeSol,
      slippageSol: fill.slippageSol,
      originalSizeSol: this.opts.positionSizeSol,
      netCostSol: fill.netSol,
    });
    this.rugState.set(mint, { devWalletSold: false, peakMarketCapSol: marketCapSol ?? 0 });

    this.opts.logger.info({ mint, priceSol, total }, "paper trade entered");
  }

  onTrade(event: Extract<NormalizedEvent, { eventType: "TradeExecuted" | "SmartMoneyTrade" }>): void {
    const position = this.positionManager.get(event.mint);
    if (!position) return;

    const trader = event.eventType === "SmartMoneyTrade" ? event.wallet : event.trader;
    const rug = this.rugState.get(event.mint) ?? { devWalletSold: false, peakMarketCapSol: 0 };
    if (trader === position.deployer && event.side === "sell") {
      rug.devWalletSold = true;
    }
    if (event.marketCapSol !== undefined) {
      rug.peakMarketCapSol = Math.max(rug.peakMarketCapSol, event.marketCapSol);
    }
    this.rugState.set(event.mint, rug);

    const marketCapCollapse =
      event.marketCapSol !== undefined &&
      rug.peakMarketCapSol > 0 &&
      (rug.peakMarketCapSol - event.marketCapSol) / rug.peakMarketCapSol >=
        this.opts.marketCapCollapseDrawdown;

    const exitEvent = this.positionManager.onPriceUpdate(
      event.mint,
      event.priceSol,
      { devWalletSold: rug.devWalletSold, marketCapCollapse },
      event.occurredAt,
    );
    if (!exitEvent) return;

    this.recordExit(event.mint, exitEvent).catch((err: unknown) => {
      this.opts.logger.error({ err, mint: event.mint }, "failed to persist paper trade exit");
    });

    if (exitEvent.positionClosed) {
      this.entryFills.delete(event.mint);
      this.rugState.delete(event.mint);
    }
  }

  private async recordExit(mint: string, exitEvent: ExitEvent): Promise<void> {
    const entryFill = this.entryFills.get(mint);
    if (!entryFill) {
      this.opts.logger.error({ mint }, "missing entry fill for an exit event");
      return;
    }

    const sliceFraction = exitEvent.sellSizeSol / entryFill.originalSizeSol;
    const entryFeeSlice = entryFill.feeSol * sliceFraction;
    const entrySlippageSlice = entryFill.slippageSol * sliceFraction;
    const entryCostSlice = entryFill.netCostSol * sliceFraction;

    const tokensSold = exitEvent.sellSizeSol / exitEvent.entryPrice;
    const exitGrossSol = tokensSold * exitEvent.exitPrice;
    const exitFill = simulateFill({
      side: "sell",
      priceSol: exitEvent.exitPrice,
      amountSol: exitGrossSol,
      platformFeeBps: this.opts.platformFeeBps,
      slippageBps: this.opts.slippageBps,
      priorityFeeSol: this.opts.priorityFeeSol,
    });

    const pnlSol = exitFill.netSol - entryCostSlice;
    const simulatedFeesSol = entryFeeSlice + exitFill.platformFeeSol + exitFill.priorityFeeSol;
    const simulatedSlippageSol = entrySlippageSlice + exitFill.slippageSol;

    await paperTradesCollection(this.opts.db).insertOne({
      mint,
      entryAt: exitEvent.entryAt,
      entryPrice: exitEvent.entryPrice,
      exitAt: new Date(),
      exitPrice: exitEvent.exitPrice,
      sizeSol: exitEvent.sellSizeSol,
      pnlSol,
      entryReason: exitEvent.entryReason,
      exitReason: exitEvent.reason,
      simulatedFeesSol,
      simulatedSlippageSol,
    });

    this.opts.logger.info(
      { mint, action: exitEvent.action, pnlSol, sizeSol: exitEvent.sellSizeSol },
      "paper trade closed",
    );
  }
}
