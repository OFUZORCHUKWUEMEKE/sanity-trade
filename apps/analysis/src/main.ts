import "dotenv/config";
import { writeFile } from "node:fs/promises";
import { createDbClient, paperTradesCollection, tokenScoresCollection } from "@memebot/db";
import { loadConfig } from "./config.js";
import { createLogger } from "./logger.js";
import { renderMarkdownReport } from "./report.js";
import {
  computeCheckSeparation,
  computeExitReasonBreakdown,
  computeExpectancy,
  computePnlByHour,
  joinTradesWithScores,
} from "./stats.js";

const config = loadConfig();
const logger = createLogger(config);

const { client: mongoClient, db } = createDbClient(config.MONGODB_URI);
await mongoClient.connect();

try {
  const [trades, scores] = await Promise.all([
    paperTradesCollection(db).find({}).toArray(),
    tokenScoresCollection(db).find({}).toArray(),
  ]);

  const signalsSeen = scores.length;
  const checkedAtTimes = scores.map((s) => s.checkedAt.getTime());
  const dataRange = {
    earliest: checkedAtTimes.length > 0 ? new Date(Math.min(...checkedAtTimes)) : undefined,
    latest: checkedAtTimes.length > 0 ? new Date(Math.max(...checkedAtTimes)) : undefined,
  };

  const expectancy = computeExpectancy(trades);
  const exitBreakdown = computeExitReasonBreakdown(trades);
  const pnlByHour = computePnlByHour(trades);
  const checkSeparation = computeCheckSeparation(joinTradesWithScores(trades, scores));

  const report = renderMarkdownReport({
    generatedAt: new Date(),
    dataRange,
    signalsSeen,
    expectancy,
    exitBreakdown,
    pnlByHour,
    checkSeparation,
    exitGateMinSignals: config.EXIT_GATE_MIN_SIGNALS,
    exitGateMinDays: config.EXIT_GATE_MIN_DAYS,
  });

  await writeFile(config.REPORT_OUTPUT_PATH, report, "utf8");
  logger.info(
    { path: config.REPORT_OUTPUT_PATH, signalsSeen, tradesTaken: expectancy.tradesTaken },
    "report written",
  );
  process.stdout.write(report);
} finally {
  await mongoClient.close();
}
