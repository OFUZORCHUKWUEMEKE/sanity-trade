import { describe, expect, it } from "vitest";
import { normalizeNewToken, normalizeSmartMoneyTrade, normalizeTrade } from "./normalize.js";
import type { RawNewToken, RawTrade } from "./pumpportal-raw.js";

const mint = "So11111111111111111111111111111111111111112";
const trader = "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM";
const signature =
  "5VfYmGB9JnpGx5LhFAX3bZ9M8YvBrH5F2QhpXhCkfYYwCzXhCzXhCzXhCzXhCzXhCzXhCzXhCzXhCzXh";
const receivedAt = new Date("2026-01-01T00:00:00.000Z");

describe("normalizeNewToken", () => {
  it("maps a raw create payload to a TokenLaunched event", () => {
    const raw: RawNewToken = {
      txType: "create",
      signature,
      mint,
      traderPublicKey: trader,
      name: "Test Token",
      symbol: "TEST",
      uri: "https://example.com/meta.json",
      pool: "pump",
    };

    const event = normalizeNewToken(raw, receivedAt);
    expect(event).toMatchObject({
      eventType: "TokenLaunched",
      mint,
      deployer: trader,
      name: "Test Token",
      symbol: "TEST",
      source: "pumpfun",
    });
    expect(event.launchedAt).toEqual(receivedAt);
  });

  it("throws on an unrecognized pool", () => {
    const raw: RawNewToken = {
      txType: "create",
      signature,
      mint,
      traderPublicKey: trader,
      name: "Test Token",
      symbol: "TEST",
      pool: "raydium",
    };
    expect(() => normalizeNewToken(raw, receivedAt)).toThrow("unrecognized pool");
  });
});

describe("normalizeTrade", () => {
  it("maps a raw trade payload to a TradeExecuted event and derives priceSol", () => {
    const raw: RawTrade = {
      txType: "buy",
      signature,
      mint,
      traderPublicKey: trader,
      tokenAmount: 1000,
      solAmount: 0.1,
      pool: "pump",
    };

    const event = normalizeTrade(raw, receivedAt);
    expect(event.priceSol).toBeCloseTo(0.0001);
    expect(event.side).toBe("buy");
    expect(event.source).toBe("pumpfun");
  });
});

describe("normalizeSmartMoneyTrade", () => {
  it("maps a raw trade payload to a SmartMoneyTrade event with a wallet label", () => {
    const raw: RawTrade = {
      txType: "sell",
      signature,
      mint,
      traderPublicKey: trader,
      tokenAmount: 500,
      solAmount: 2.5,
      pool: "bonk",
    };

    const event = normalizeSmartMoneyTrade(raw, "known-whale", receivedAt);
    expect(event.eventType).toBe("SmartMoneyTrade");
    expect(event.walletLabel).toBe("known-whale");
    expect(event.wallet).toBe(trader);
    expect(event.source).toBe("bonkfun");
  });
});
