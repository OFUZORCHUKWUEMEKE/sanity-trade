import "dotenv/config";
import { createDbClient, ensureIndexes } from "@memebot/db";
import { Redis } from "ioredis";
import { loadConfig } from "./config.js";
import { createLogger } from "./logger.js";
import { createHealthServer } from "./server.js";
import { ControlStateCache } from "./control-state.js";
import { incrementDeployerTokenCount } from "./deployer-repo.js";
import { MintStatsTracker } from "./mint-stats.js";
import { PaperTrader } from "./paper-trader.js";
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

// PAPER_MODE gates the trader: Phase 1 has no real execution path at all,
// so if it's ever set to false there's simply nothing to run yet.
const controlState = new ControlStateCache(db, config.CONTROL_STATE_TTL_MS, logger);

const paperTrader = config.PAPER_MODE
  ? new PaperTrader({
      db,
      logger,
      controlState,
      positionSizeSol: config.POSITION_SIZE_SOL,
      maxConcurrent: config.MAX_CONCURRENT_POSITIONS,
      entryScoreThreshold: config.ENTRY_SCORE_THRESHOLD,
      takeProfitMultiple: config.TAKE_PROFIT_MULTIPLE,
      takeProfitSellFraction: config.TAKE_PROFIT_SELL_FRACTION,
      trailingStopPercent: config.TRAILING_STOP_PERCENT,
      marketCapCollapseDrawdown: config.MARKET_CAP_COLLAPSE_DRAWDOWN,
      platformFeeBps: config.PLATFORM_FEE_BPS,
      slippageBps: config.SLIPPAGE_BPS,
      priorityFeeSol: config.PRIORITY_FEE_SOL,
    })
  : undefined;

if (!paperTrader) {
  logger.warn("PAPER_MODE is false; Phase 1 has no real execution path, so no trades will be taken");
}

function runScoring(mint: string, deployer: string): void {
  scoreToken(scorerDeps, mint, deployer)
    .then(async (result) => {
      const stats = mintStats.get(mint);
      await paperTrader?.tryEnter(
        mint,
        deployer,
        result.total,
        result.hardRejected,
        stats?.latestPriceSol,
        stats?.marketCapSol,
      );
    })
    .catch((err: unknown) => {
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
  } else {
    paperTrader?.onTrade(event);
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
