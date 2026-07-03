import "dotenv/config";
import { createDbClient, ensureIndexes } from "@memebot/db";
import { loadConfig } from "./config.js";
import { createLogger } from "./logger.js";
import { createHealthServer } from "./server.js";
import { CommandPoller } from "./command-poller.js";
import { DailySummaryScheduler } from "./daily-summary.js";
import { TelegramClient } from "./telegram-client.js";
import { startTradeWatcher } from "./trade-watcher.js";

const config = loadConfig();
const logger = createLogger(config);
const server = createHealthServer(config.NOTIFIER_PORT, logger);

const { client: mongoClient, db } = createDbClient(config.MONGODB_URI);
await mongoClient.connect();
await ensureIndexes(db);

let tradeWatcher: { stop: () => Promise<void> } | undefined;
let commandPoller: CommandPoller | undefined;
let commandPollerPromise: Promise<void> | undefined;
let dailySummaryTimer: NodeJS.Timeout | undefined;

if (!config.TELEGRAM_BOT_TOKEN || !config.TELEGRAM_CHAT_ID) {
  logger.warn(
    "TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID not set; notifier will not send alerts or accept commands",
  );
} else {
  const telegram = new TelegramClient(config.TELEGRAM_BOT_TOKEN);

  tradeWatcher = startTradeWatcher({
    db,
    telegram,
    chatId: config.TELEGRAM_CHAT_ID,
    logger,
  });

  const dailySummaryScheduler = new DailySummaryScheduler(
    { db, telegram, chatId: config.TELEGRAM_CHAT_ID, logger },
    config.DAILY_SUMMARY_HOUR_UTC,
  );
  dailySummaryTimer = dailySummaryScheduler.start();

  commandPoller = new CommandPoller({
    telegram,
    commandDeps: {
      db,
      paperMode: config.PAPER_MODE,
      maxConcurrent: config.MAX_CONCURRENT_POSITIONS,
    },
    logger,
    pollTimeoutSeconds: config.COMMAND_POLL_TIMEOUT_SECONDS,
  });
  commandPollerPromise = commandPoller.start().catch((err: unknown) => {
    logger.error({ err }, "command poller crashed");
  });
}

logger.info({ env: config.NODE_ENV }, "ready");

async function shutdown(signal: string) {
  logger.info({ signal }, "shutting down");
  commandPoller?.stop();
  if (commandPollerPromise) await commandPollerPromise;
  if (dailySummaryTimer) clearInterval(dailySummaryTimer);
  if (tradeWatcher) await tradeWatcher.stop();
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
