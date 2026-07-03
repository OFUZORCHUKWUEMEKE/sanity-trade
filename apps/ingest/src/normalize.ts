import type { SmartMoneyTrade, TokenLaunched, TradeExecuted } from "@memebot/core";
import { smartMoneyTradeSchema, tokenLaunchedSchema, tradeExecutedSchema } from "@memebot/core";
import { mapPoolToSource, type RawNewToken, type RawTrade } from "./pumpportal-raw.js";

export function normalizeNewToken(raw: RawNewToken, receivedAt: Date): TokenLaunched {
  return tokenLaunchedSchema.parse({
    eventType: "TokenLaunched",
    mint: raw.mint,
    deployer: raw.traderPublicKey,
    name: raw.name,
    symbol: raw.symbol,
    uri: raw.uri,
    source: mapPoolToSource(raw.pool),
    launchedAt: receivedAt,
  });
}

export function normalizeTrade(raw: RawTrade, receivedAt: Date): TradeExecuted {
  return tradeExecutedSchema.parse({
    eventType: "TradeExecuted",
    mint: raw.mint,
    trader: raw.traderPublicKey,
    side: raw.txType,
    solAmount: raw.solAmount,
    tokenAmount: raw.tokenAmount,
    priceSol: raw.solAmount / raw.tokenAmount,
    marketCapSol: raw.marketCapSol,
    signature: raw.signature,
    source: mapPoolToSource(raw.pool),
    occurredAt: receivedAt,
  });
}

export function normalizeSmartMoneyTrade(
  raw: RawTrade,
  walletLabel: string | undefined,
  receivedAt: Date,
): SmartMoneyTrade {
  return smartMoneyTradeSchema.parse({
    eventType: "SmartMoneyTrade",
    mint: raw.mint,
    wallet: raw.traderPublicKey,
    walletLabel,
    side: raw.txType,
    solAmount: raw.solAmount,
    tokenAmount: raw.tokenAmount,
    priceSol: raw.solAmount / raw.tokenAmount,
    marketCapSol: raw.marketCapSol,
    signature: raw.signature,
    source: mapPoolToSource(raw.pool),
    occurredAt: receivedAt,
  });
}
