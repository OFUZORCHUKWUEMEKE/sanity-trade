import type { NormalizedEvent } from "@memebot/core";

/** Approximate pump.fun bonding-curve graduation market cap, in SOL. */
export const GRADUATION_MARKET_CAP_SOL = 85;

export interface MintStats {
  mint: string;
  deployer: string | undefined;
  launchedAt: Date;
  uniqueBuyers: Set<string>;
  marketCapSol: number;
  latestPriceSol: number | undefined;
}

export class MintStatsTracker {
  private readonly stats = new Map<string, MintStats>();

  onEvent(event: NormalizedEvent): void {
    if (event.eventType === "TokenLaunched") {
      const existing = this.stats.get(event.mint);
      if (existing) {
        existing.deployer = event.deployer;
      } else {
        this.stats.set(event.mint, {
          mint: event.mint,
          deployer: event.deployer,
          launchedAt: event.launchedAt,
          uniqueBuyers: new Set(),
          marketCapSol: 0,
          latestPriceSol: undefined,
        });
      }
      return;
    }

    // TradeExecuted / SmartMoneyTrade
    const trader = event.eventType === "SmartMoneyTrade" ? event.wallet : event.trader;
    let entry = this.stats.get(event.mint);
    if (!entry) {
      entry = {
        mint: event.mint,
        deployer: undefined,
        launchedAt: event.occurredAt,
        uniqueBuyers: new Set(),
        marketCapSol: 0,
        latestPriceSol: undefined,
      };
      this.stats.set(event.mint, entry);
    }

    if (event.side === "buy") {
      entry.uniqueBuyers.add(trader);
    }
    if (event.marketCapSol !== undefined) {
      entry.marketCapSol = event.marketCapSol;
    }
    entry.latestPriceSol = event.priceSol;
  }

  get(mint: string): MintStats | undefined {
    return this.stats.get(mint);
  }

  curveProgressPercent(mint: string): number {
    const entry = this.stats.get(mint);
    if (!entry) return 0;
    return Math.min(100, (entry.marketCapSol / GRADUATION_MARKET_CAP_SOL) * 100);
  }

  minutesSinceLaunch(mint: string, now: Date = new Date()): number {
    const entry = this.stats.get(mint);
    if (!entry) return 0;
    return (now.getTime() - entry.launchedAt.getTime()) / 60_000;
  }
}
