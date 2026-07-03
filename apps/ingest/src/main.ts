import "dotenv/config";
import { createDbClient, ensureIndexes } from "@memebot/db";
import { Redis } from "ioredis";
import { loadConfig } from "./config.js";
import { createLogger } from "./logger.js";
import { createHealthServer } from "./server.js";
import { createPipeline } from "./pipeline.js";
import { PumpPortalClient } from "./pumpportal-client.js";
import { SubscriptionManager } from "./subscription-manager.js";
import { loadWatchedWallets } from "./watched-wallets.js";

const config = loadConfig();
const logger = createLogger(config);
const server = createHealthServer(config.INGEST_PORT, logger);

const { client: mongoClient, db } = createDbClient(config.MONGODB_URI);
await mongoClient.connect();
await ensureIndexes(db);

const walletLabels = await loadWatchedWallets(db);
logger.info({ count: walletLabels.size }, "loaded watched wallets");

const redis = new Redis(config.REDIS_URL);
const subscriptionManager = new SubscriptionManager(config.TRACKED_MINT_TTL_MS);

const pumpPortalClient = new PumpPortalClient({
  url: config.PUMPPORTAL_WS_URL,
  logger,
  heartbeatTimeoutMs: config.HEARTBEAT_TIMEOUT_MS,
  reconnectBaseDelayMs: config.RECONNECT_BASE_DELAY_MS,
  reconnectMaxDelayMs: config.RECONNECT_MAX_DELAY_MS,
  watchedWallets: () => [...walletLabels.keys()],
  resubscribeTrackedMints: () => subscriptionManager.resubscribeAllCommand(),
});

const pipeline = createPipeline({
  db,
  redis,
  logger,
  streamKey: config.REDIS_EVENTS_STREAM,
  dedupTtlSeconds: config.DEDUP_TTL_SECONDS,
  subscriptionManager,
  client: pumpPortalClient,
  walletLabels,
});

pumpPortalClient.on("message", (raw: unknown) => {
  pipeline.handleMessage(raw).catch((err) => {
    logger.error({ err }, "failed to handle message");
  });
});

const pruneInterval = setInterval(() => {
  pipeline.pruneSubscriptions();
}, 30_000);

const statsInterval = setInterval(() => {
  logger.info(
    { ...pipeline.stats, trackedMints: subscriptionManager.trackedCount },
    "ingest stats",
  );
}, config.STATS_INTERVAL_MS);

pumpPortalClient.start();

logger.info({ env: config.NODE_ENV }, "ready");

async function shutdown(signal: string) {
  logger.info({ signal }, "shutting down");
  clearInterval(pruneInterval);
  clearInterval(statsInterval);
  pumpPortalClient.stop();
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
