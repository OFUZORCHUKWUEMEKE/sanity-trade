import { describe, expect, it } from "vitest";
import { isRawNewToken, isRawTrade, mapPoolToSource } from "./pumpportal-raw.js";

const mint = "So11111111111111111111111111111111111111112";
const trader = "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM";

describe("isRawNewToken", () => {
  it("accepts a create-type payload", () => {
    expect(
      isRawNewToken({
        txType: "create",
        signature: "sig",
        mint,
        traderPublicKey: trader,
        name: "Test",
        symbol: "TEST",
        pool: "pump",
      }),
    ).toBe(true);
  });

  it("rejects a buy-type payload", () => {
    expect(
      isRawNewToken({
        txType: "buy",
        signature: "sig",
        mint,
        traderPublicKey: trader,
        tokenAmount: 1,
        solAmount: 1,
        pool: "pump",
      }),
    ).toBe(false);
  });
});

describe("isRawTrade", () => {
  it("accepts a buy-type payload", () => {
    expect(
      isRawTrade({
        txType: "buy",
        signature: "sig",
        mint,
        traderPublicKey: trader,
        tokenAmount: 1000,
        solAmount: 0.1,
        pool: "pump",
      }),
    ).toBe(true);
  });

  it("rejects a create-type payload", () => {
    expect(
      isRawTrade({
        txType: "create",
        signature: "sig",
        mint,
        traderPublicKey: trader,
        name: "Test",
        symbol: "TEST",
        pool: "pump",
      }),
    ).toBe(false);
  });
});

describe("mapPoolToSource", () => {
  it("maps pump to pumpfun", () => {
    expect(mapPoolToSource("pump")).toBe("pumpfun");
  });

  it("maps bonk to bonkfun", () => {
    expect(mapPoolToSource("bonk")).toBe("bonkfun");
  });

  it("throws on an unrecognized pool", () => {
    expect(() => mapPoolToSource("raydium")).toThrow("unrecognized pool");
  });
});
