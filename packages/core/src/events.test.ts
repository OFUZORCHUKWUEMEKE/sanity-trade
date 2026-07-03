import { describe, expect, it } from "vitest";
import {
  normalizedEventSchema,
  smartMoneyTradeSchema,
  tokenLaunchedSchema,
  tradeExecutedSchema,
} from "./events.js";

const mint = "So11111111111111111111111111111111111111112";
const deployer = "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM";
const trader = "5Q544fKrFoe6tsEbD7S8EmxGTJYAKtTVhAW5Q5pge4j1";
const signature =
  "5VfYmGB9JnpGx5LhFAX3bZ9M8YvBrH5F2QhpXhCkfYYwCzXhCzXhCzXhCzXhCzXhCzXhCzXhCzXhCzXh";

describe("tokenLaunchedSchema", () => {
  it("parses a valid TokenLaunched event", () => {
    const result = tokenLaunchedSchema.parse({
      eventType: "TokenLaunched",
      mint,
      deployer,
      name: "Test Token",
      symbol: "TEST",
      source: "pumpfun",
      launchedAt: new Date().toISOString(),
    });
    expect(result.mint).toBe(mint);
    expect(result.launchedAt).toBeInstanceOf(Date);
  });

  it("rejects an invalid mint address", () => {
    expect(() =>
      tokenLaunchedSchema.parse({
        eventType: "TokenLaunched",
        mint: "not-a-valid-address",
        deployer,
        name: "Test Token",
        symbol: "TEST",
        source: "pumpfun",
        launchedAt: new Date().toISOString(),
      }),
    ).toThrow();
  });
});

describe("tradeExecutedSchema", () => {
  it("parses a valid TradeExecuted event", () => {
    const result = tradeExecutedSchema.parse({
      eventType: "TradeExecuted",
      mint,
      trader,
      side: "buy",
      solAmount: 0.1,
      tokenAmount: 1000,
      priceSol: 0.0001,
      signature,
      source: "pumpfun",
      occurredAt: new Date().toISOString(),
    });
    expect(result.side).toBe("buy");
  });

  it("rejects a non-positive solAmount", () => {
    expect(() =>
      tradeExecutedSchema.parse({
        eventType: "TradeExecuted",
        mint,
        trader,
        side: "buy",
        solAmount: 0,
        tokenAmount: 1000,
        priceSol: 0.0001,
        signature,
        source: "pumpfun",
        occurredAt: new Date().toISOString(),
      }),
    ).toThrow();
  });
});

describe("smartMoneyTradeSchema", () => {
  it("parses a valid SmartMoneyTrade event", () => {
    const result = smartMoneyTradeSchema.parse({
      eventType: "SmartMoneyTrade",
      mint,
      wallet: trader,
      walletLabel: "known-whale",
      side: "sell",
      solAmount: 2.5,
      tokenAmount: 5000,
      priceSol: 0.0005,
      signature,
      source: "bonkfun",
      occurredAt: new Date().toISOString(),
    });
    expect(result.walletLabel).toBe("known-whale");
  });
});

describe("normalizedEventSchema", () => {
  it("discriminates between event types", () => {
    const event = normalizedEventSchema.parse({
      eventType: "TokenLaunched",
      mint,
      deployer,
      name: "Test Token",
      symbol: "TEST",
      source: "pumpfun",
      launchedAt: new Date().toISOString(),
    });
    expect(event.eventType).toBe("TokenLaunched");
  });

  it("rejects an unknown eventType", () => {
    expect(() =>
      normalizedEventSchema.parse({
        eventType: "UnknownEvent",
        mint,
      }),
    ).toThrow();
  });
});
