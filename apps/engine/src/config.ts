import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  ENGINE_PORT: z.coerce.number().int().positive().default(3002),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace"]).default("info"),
  MONGODB_URI: z.string().min(1).default("mongodb://localhost:27017/memebot"),
  REDIS_URL: z.string().min(1).default("redis://localhost:6379"),
  PAPER_MODE: z
    .string()
    .default("true")
    .transform((v) => v !== "false"),
  REDIS_EVENTS_STREAM: z.string().min(1).default("memebot:events"),
  SOLANA_RPC_URL: z.string().url().default("https://api.mainnet-beta.solana.com"),
  RUGCHECK_BASE_URL: z.string().url().default("https://api.rugcheck.xyz/v1"),
  RATE_LIMIT_DELAY_MS: z.coerce.number().int().nonnegative().default(250),
  SCORE_T60_MS: z.coerce.number().int().positive().default(60_000),
  SCORE_T5MIN_MS: z.coerce.number().int().positive().default(300_000),

  // Paper trader / risk rules (CLAUDE.md: max 0.1 SOL position, max 3
  // concurrent, non-negotiable defaults - override only with intent).
  ENTRY_SCORE_THRESHOLD: z.coerce.number().min(0).max(100).default(70),
  POSITION_SIZE_SOL: z.coerce.number().positive().default(0.1),
  MAX_CONCURRENT_POSITIONS: z.coerce.number().int().positive().default(3),
  TAKE_PROFIT_MULTIPLE: z.coerce.number().positive().default(2),
  TAKE_PROFIT_SELL_FRACTION: z.coerce.number().min(0).max(1).default(0.5),
  TRAILING_STOP_PERCENT: z.coerce.number().min(0).max(1).default(0.2),
  MARKET_CAP_COLLAPSE_DRAWDOWN: z.coerce.number().min(0).max(1).default(0.6),
  PLATFORM_FEE_BPS: z.coerce.number().int().nonnegative().default(125),
  SLIPPAGE_BPS: z.coerce.number().int().nonnegative().default(100),
  PRIORITY_FEE_SOL: z.coerce.number().nonnegative().default(0.0005),
});

export type Config = z.infer<typeof envSchema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  return envSchema.parse(env);
}
