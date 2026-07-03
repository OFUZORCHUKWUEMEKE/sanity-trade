import "dotenv/config";
import { createDbClient, ensureIndexes } from "@memebot/db";
import { Redis } from "ioredis";
import { loadConfig } from "./config.js";
import { createLogger } from "./logger.js";
import { createHealthServer } from "./server.js";
import { incrementDeployerTokenCount } from "./deployer-repo.js";
import { MintStatsTracker } from "./mint-stats.js";
import { scheduleRescoring } from "./scheduler.js";
import { scoreToken } from "./scorer.js";
import { createSolanaConnection } from "./solana-rpc.js";
import { StreamConsumer } from "./stream-consumer.js";

const config = loadConfig();
const logger = createLogger(config);
const server = createHealthServer(config.ENGINE_PORT, logger);

const { client: mongoClient, db } = createDbClient(config.MONGODB_URI);
await mongoClient.connect();
await ensureIndexes(db);

const redis = new Redis(config.REDIS_URL);
const connection = createSolanaConnection(config.SOLANA_RPC_URL);
const mintStats = new MintStatsTracker();

const scorerDeps = {
  db,
  connection,
  mintStats,
  logger,
  rateLimitDelayMs: config.RATE_LIMIT_DELAY_MS,
  rugCheckBaseUrl: config.RUGCHECK_BASE_URL,
};

function runScoring(mint: string, deployer: string): void {
  scoreToken(scorerDeps, mint, deployer).catch((err: unknown) => {
    logger.error({ err, mint }, "scoring pass failed");
  });
}

const consumer = new StreamConsumer(redis, config.REDIS_EVENTS_STREAM, (event) => {
  mintStats.onEvent(event);

  if (event.eventType === "TokenLaunched") {
    incrementDeployerTokenCount(db, event.deployer).catch((err: unknown) => {
      logger.error({ err, deployer: event.deployer }, "failed to increment deployer token count");
    });
    scheduleRescoring(event.mint, event.deployer, [config.SCORE_T60_MS, config.SCORE_T5MIN_MS], runScoring);
  }
}, logger);

const consumerPromise = consumer.start().catch((err: unknown) => {
  logger.error({ err }, "stream consumer crashed");
});

logger.info({ env: config.NODE_ENV, paperMode: config.PAPER_MODE }, "ready");

async function shutdown(signal: string) {
  logger.info({ signal }, "shutting down");
  consumer.stop();
  await consumerPromise;
  await redis.quit();
  await mongoClient.close();
  server.close(() => {
    logger.info("shutdown complete");
    process.exit(0);
  });
  setTimeout(() => {
    logger.warn("forced shutdown after timeout");
    process.exit(1);
  }, 5000).unref();
}

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));
