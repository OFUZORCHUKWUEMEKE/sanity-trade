import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  INGEST_PORT: z.coerce.number().int().positive().default(3001),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace"]).default("info"),
  MONGODB_URI: z.string().min(1).default("mongodb://localhost:27017/memebot"),
  REDIS_URL: z.string().min(1).default("redis://localhost:6379"),
  PUMPPORTAL_WS_URL: z.string().url().default("wss://pumpportal.fun/api/data"),
  HEARTBEAT_TIMEOUT_MS: z.coerce.number().int().positive().default(30_000),
  RECONNECT_BASE_DELAY_MS: z.coerce.number().int().positive().default(1_000),
  RECONNECT_MAX_DELAY_MS: z.coerce.number().int().positive().default(30_000),
  TRACKED_MINT_TTL_MS: z.coerce.number().int().positive().default(10 * 60_000),
  DEDUP_TTL_SECONDS: z.coerce.number().int().positive().default(600),
  STATS_INTERVAL_MS: z.coerce.number().int().positive().default(60_000),
  REDIS_EVENTS_STREAM: z.string().min(1).default("memebot:events"),
});

export type Config = z.infer<typeof envSchema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  return envSchema.parse(env);
}
