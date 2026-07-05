import { z } from "zod";

const envSchema = z.object({
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace"]).default("info"),
  MONGODB_URI: z.string().min(1).default("mongodb://localhost:27017/memebot"),
  // Phase 1 exit gate thresholds (CLAUDE.md): >=2 weeks of data, >=100 signals,
  // positive expectancy after simulated fees.
  EXIT_GATE_MIN_SIGNALS: z.coerce.number().int().positive().default(100),
  EXIT_GATE_MIN_DAYS: z.coerce.number().positive().default(14),
  REPORT_OUTPUT_PATH: z.string().min(1).default("analysis-report.md"),
});

export type Config = z.infer<typeof envSchema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  return envSchema.parse(env);
}
