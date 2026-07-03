import {
  ENGINE_CONTROL_DOC_ID,
  engineControlCollection,
  openPositionsCollection,
  type Db,
} from "@memebot/db";
import { formatPositions, formatStatus } from "./format.js";

export interface CommandDeps {
  db: Db;
  paperMode: boolean;
  maxConcurrent: number;
}

function parseCommand(text: string): string {
  const first = text.trim().split(/\s+/)[0] ?? "";
  return first.replace(/@\w+$/, "").toLowerCase();
}

export async function handleCommand(deps: CommandDeps, text: string): Promise<string> {
  switch (parseCommand(text)) {
    case "/status": {
      const control = await engineControlCollection(deps.db).findOne({
        _id: ENGINE_CONTROL_DOC_ID,
      });
      const openPositionCount = await openPositionsCollection(deps.db).countDocuments({});
      return formatStatus({
        paperMode: deps.paperMode,
        paused: control?.paused ?? false,
        killed: control?.killed ?? false,
        openPositionCount,
        maxConcurrent: deps.maxConcurrent,
      });
    }

    case "/positions": {
      const positions = await openPositionsCollection(deps.db).find({}).toArray();
      return formatPositions(
        positions.map((p) => ({
          mint: p.mint,
          entryPrice: p.entryPrice,
          remainingSizeSol: p.remainingSizeSol,
          peakPriceSol: p.peakPriceSol,
          tookInitialTakeProfit: p.tookInitialTakeProfit,
        })),
      );
    }

    case "/pause": {
      await engineControlCollection(deps.db).updateOne(
        { _id: ENGINE_CONTROL_DOC_ID },
        { $set: { paused: true, updatedAt: new Date() } },
        { upsert: true },
      );
      return "Paused. No new positions will be opened until /resume.";
    }

    case "/resume": {
      await engineControlCollection(deps.db).updateOne(
        { _id: ENGINE_CONTROL_DOC_ID },
        { $set: { paused: false, updatedAt: new Date() } },
        { upsert: true },
      );
      return "Resumed. New positions may be opened again.";
    }

    case "/kill": {
      await engineControlCollection(deps.db).updateOne(
        { _id: ENGINE_CONTROL_DOC_ID },
        { $set: { killed: true, paused: true, updatedAt: new Date() } },
        { upsert: true },
      );
      return (
        "Killed. No new positions will be opened. Open positions still exit " +
        "normally through the exit manager. Requires a manual reset to clear."
      );
    }

    default:
      return "Unknown command. Available: /status /positions /pause /resume /kill";
  }
}
