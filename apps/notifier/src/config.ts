import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  NOTIFIER_PORT: z.coerce.number().int().positive().default(3003),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace"]).default("info"),
  MONGODB_URI: z.string().min(1).default("mongodb://localhost:27017/memebot"),
  TELEGRAM_BOT_TOKEN: z.string().default(""),
  TELEGRAM_CHAT_ID: z.string().default(""),
  // Mirrors of the engine's own config, so /status can report accurately.
  // Keep these in sync with apps/engine's PAPER_MODE / MAX_CONCURRENT_POSITIONS.
  PAPER_MODE: z
    .string()
    .default("true")
    .transform((v) => v !== "false"),
  MAX_CONCURRENT_POSITIONS: z.coerce.number().int().positive().default(3),
  DAILY_SUMMARY_HOUR_UTC: z.coerce.number().int().min(0).max(23).default(9),
  COMMAND_POLL_TIMEOUT_SECONDS: z.coerce.number().int().nonnegative().default(30),
});

export type Config = z.infer<typeof envSchema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  return envSchema.parse(env);
}
