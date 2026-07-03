import "dotenv/config";
import { loadConfig } from "./config.js";
import { createLogger } from "./logger.js";
import { createHealthServer } from "./server.js";

const config = loadConfig();
const logger = createLogger(config);
const server = createHealthServer(config.NOTIFIER_PORT, logger);

logger.info({ env: config.NODE_ENV }, "ready");

async function shutdown(signal: string) {
  logger.info({ signal }, "shutting down");
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
