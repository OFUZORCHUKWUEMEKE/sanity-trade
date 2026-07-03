import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  ENGINE_PORT: z.coerce.number().int().positive().default(3002),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace"]).default("info"),
  DATABASE_URL: z.string().min(1).default("postgres://memebot:memebot@localhost:5432/memebot"),
  REDIS_URL: z.string().min(1).default("redis://localhost:6379"),
  PAPER_MODE: z
    .string()
    .default("true")
    .transform((v) => v !== "false"),
});

export type Config = z.infer<typeof envSchema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  return envSchema.parse(env);
}
