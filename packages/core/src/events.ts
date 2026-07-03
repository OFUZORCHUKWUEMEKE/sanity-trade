import { z } from "zod";

const SOLANA_ADDRESS_REGEX = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const SOLANA_SIGNATURE_REGEX = /^[1-9A-HJ-NP-Za-km-z]{64,88}$/;

const solanaAddress = z.string().regex(SOLANA_ADDRESS_REGEX, "invalid Solana address");
const solanaSignature = z.string().regex(SOLANA_SIGNATURE_REGEX, "invalid Solana signature");

export const eventSourceSchema = z.enum(["pumpfun", "bonkfun"]);
export type EventSource = z.infer<typeof eventSourceSchema>;

export const tradeSideSchema = z.enum(["buy", "sell"]);
export type TradeSide = z.infer<typeof tradeSideSchema>;

export const tokenLaunchedSchema = z.object({
  eventType: z.literal("TokenLaunched"),
  mint: solanaAddress,
  deployer: solanaAddress,
  name: z.string().min(1),
  symbol: z.string().min(1),
  uri: z.string().url().optional(),
  source: eventSourceSchema,
  launchedAt: z.coerce.date(),
});
export type TokenLaunched = z.infer<typeof tokenLaunchedSchema>;

export const tradeExecutedSchema = z.object({
  eventType: z.literal("TradeExecuted"),
  mint: solanaAddress,
  trader: solanaAddress,
  side: tradeSideSchema,
  solAmount: z.number().positive(),
  tokenAmount: z.number().positive(),
  priceSol: z.number().positive(),
  marketCapSol: z.number().nonnegative().optional(),
  signature: solanaSignature,
  source: eventSourceSchema,
  occurredAt: z.coerce.date(),
});
export type TradeExecuted = z.infer<typeof tradeExecutedSchema>;

export const smartMoneyTradeSchema = z.object({
  eventType: z.literal("SmartMoneyTrade"),
  mint: solanaAddress,
  wallet: solanaAddress,
  walletLabel: z.string().min(1).optional(),
  side: tradeSideSchema,
  solAmount: z.number().positive(),
  tokenAmount: z.number().positive(),
  priceSol: z.number().positive(),
  marketCapSol: z.number().nonnegative().optional(),
  signature: solanaSignature,
  source: eventSourceSchema,
  occurredAt: z.coerce.date(),
});
export type SmartMoneyTrade = z.infer<typeof smartMoneyTradeSchema>;

export const normalizedEventSchema = z.discriminatedUnion("eventType", [
  tokenLaunchedSchema,
  tradeExecutedSchema,
  smartMoneyTradeSchema,
]);
export type NormalizedEvent = z.infer<typeof normalizedEventSchema>;
