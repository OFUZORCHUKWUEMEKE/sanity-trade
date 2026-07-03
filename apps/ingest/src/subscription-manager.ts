export interface SubscriptionCommand {
  method: "subscribeTokenTrade" | "unsubscribeTokenTrade";
  keys: string[];
}

/**
 * Tracks which mints we've asked PumpPortal for trade events on. Mints are
 * pruned after ttlMs since a momentum/graduation window is short-lived;
 * without pruning the subscribed-keys list grows unbounded for the life of
 * the process.
 */
export class SubscriptionManager {
  private readonly trackedSince = new Map<string, number>();

  constructor(private readonly ttlMs: number) {}

  track(mint: string, now: number): SubscriptionCommand | undefined {
    if (this.trackedSince.has(mint)) {
      return undefined;
    }
    this.trackedSince.set(mint, now);
    return { method: "subscribeTokenTrade", keys: [mint] };
  }

  pruneExpired(now: number): SubscriptionCommand | undefined {
    const expired: string[] = [];
    for (const [mint, since] of this.trackedSince) {
      if (now - since >= this.ttlMs) {
        expired.push(mint);
      }
    }
    if (expired.length === 0) {
      return undefined;
    }
    for (const mint of expired) {
      this.trackedSince.delete(mint);
    }
    return { method: "unsubscribeTokenTrade", keys: expired };
  }

  resubscribeAllCommand(): SubscriptionCommand | undefined {
    const keys = [...this.trackedSince.keys()];
    if (keys.length === 0) {
      return undefined;
    }
    return { method: "subscribeTokenTrade", keys };
  }

  get trackedCount(): number {
    return this.trackedSince.size;
  }
}
