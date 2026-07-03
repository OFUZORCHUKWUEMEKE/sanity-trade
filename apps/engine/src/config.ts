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
});

export type Config = z.infer<typeof envSchema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  return envSchema.parse(env);
}
