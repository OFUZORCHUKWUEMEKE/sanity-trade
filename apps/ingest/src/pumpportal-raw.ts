import { z } from "zod";

const solanaAddress = z.string().min(32).max(44);

export const rawNewTokenSchema = z.object({
  txType: z.literal("create"),
  signature: z.string(),
  mint: solanaAddress,
  traderPublicKey: solanaAddress,
  name: z.string(),
  symbol: z.string(),
  uri: z.string().optional(),
  marketCapSol: z.number().nonnegative().optional(),
  pool: z.string(),
});
export type RawNewToken = z.infer<typeof rawNewTokenSchema>;

export const rawTradeSchema = z.object({
  txType: z.enum(["buy", "sell"]),
  signature: z.string(),
  mint: solanaAddress,
  traderPublicKey: solanaAddress,
  tokenAmount: z.number().positive(),
  solAmount: z.number().positive(),
  marketCapSol: z.number().nonnegative().optional(),
  pool: z.string(),
});
export type RawTrade = z.infer<typeof rawTradeSchema>;

export function isRawNewToken(payload: unknown): payload is RawNewToken {
  return rawNewTokenSchema.safeParse(payload).success;
}

export function isRawTrade(payload: unknown): payload is RawTrade {
  return rawTradeSchema.safeParse(payload).success;
}

const POOL_TO_SOURCE: Record<string, "pumpfun" | "bonkfun"> = {
  pump: "pumpfun",
  pumpfun: "pumpfun",
  bonk: "bonkfun",
  bonkfun: "bonkfun",
};

export function mapPoolToSource(pool: string): "pumpfun" | "bonkfun" {
  const source = POOL_TO_SOURCE[pool.toLowerCase()];
  if (!source) {
    throw new Error(`unrecognized pool: ${pool}`);
  }
  return source;
}
