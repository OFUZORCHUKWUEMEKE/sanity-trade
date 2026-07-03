import { describe, expect, it } from "vitest";
import { SubscriptionManager } from "./subscription-manager.js";

describe("SubscriptionManager", () => {
  it("emits a subscribe command the first time a mint is tracked", () => {
    const mgr = new SubscriptionManager(10_000);
    const cmd = mgr.track("mintA", 0);
    expect(cmd).toEqual({ method: "subscribeTokenTrade", keys: ["mintA"] });
    expect(mgr.trackedCount).toBe(1);
  });

  it("does not re-emit a subscribe command for an already-tracked mint", () => {
    const mgr = new SubscriptionManager(10_000);
    mgr.track("mintA", 0);
    const second = mgr.track("mintA", 100);
    expect(second).toBeUndefined();
    expect(mgr.trackedCount).toBe(1);
  });

  it("prunes mints older than the TTL and emits an unsubscribe command", () => {
    const mgr = new SubscriptionManager(10_000);
    mgr.track("mintA", 0);
    mgr.track("mintB", 5_000);

    const prunedAt10s = mgr.pruneExpired(10_000);
    expect(prunedAt10s).toEqual({ method: "unsubscribeTokenTrade", keys: ["mintA"] });
    expect(mgr.trackedCount).toBe(1);

    const prunedAt15s = mgr.pruneExpired(15_000);
    expect(prunedAt15s).toEqual({ method: "unsubscribeTokenTrade", keys: ["mintB"] });
    expect(mgr.trackedCount).toBe(0);
  });

  it("returns undefined when nothing has expired", () => {
    const mgr = new SubscriptionManager(10_000);
    mgr.track("mintA", 0);
    expect(mgr.pruneExpired(5_000)).toBeUndefined();
  });

  it("builds a resubscribe-all command from currently tracked mints", () => {
    const mgr = new SubscriptionManager(10_000);
    expect(mgr.resubscribeAllCommand()).toBeUndefined();

    mgr.track("mintA", 0);
    mgr.track("mintB", 0);
    expect(mgr.resubscribeAllCommand()).toEqual({
      method: "subscribeTokenTrade",
      keys: ["mintA", "mintB"],
    });
  });
});
