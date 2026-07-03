import type { Db } from "@memebot/db";
import { describe, expect, it, vi } from "vitest";
import { handleCommand } from "./commands.js";

const mint = "So11111111111111111111111111111111111111112";

function fakeDb(opts: {
  control?: { paused: boolean; killed: boolean } | null;
  openPositions?: unknown[];
}) {
  const findOne = vi.fn().mockResolvedValue(opts.control ?? null);
  const countDocuments = vi.fn().mockResolvedValue(opts.openPositions?.length ?? 0);
  const toArray = vi.fn().mockResolvedValue(opts.openPositions ?? []);
  const find = vi.fn().mockReturnValue({ toArray });
  const updateOne = vi.fn().mockResolvedValue(undefined);
  const collection = vi.fn().mockReturnValue({ findOne, countDocuments, find, updateOne });
  return { db: { collection } as unknown as Db, findOne, countDocuments, find, updateOne };
}

describe("handleCommand", () => {
  it("/status reports running with no control doc yet", async () => {
    const { db } = fakeDb({});
    const text = await handleCommand({ db, paperMode: true, maxConcurrent: 3 }, "/status");
    expect(text).toContain("State: running");
    expect(text).toContain("0/3");
  });

  it("/status reflects a paused control doc", async () => {
    const { db } = fakeDb({ control: { paused: true, killed: false } });
    const text = await handleCommand({ db, paperMode: true, maxConcurrent: 3 }, "/status");
    expect(text).toContain("State: paused");
  });

  it("/positions lists open positions from the read model", async () => {
    const { db } = fakeDb({
      openPositions: [
        {
          mint,
          entryPrice: 0.0001,
          remainingSizeSol: 0.05,
          peakPriceSol: 0.0002,
          tookInitialTakeProfit: true,
        },
      ],
    });
    const text = await handleCommand({ db, paperMode: true, maxConcurrent: 3 }, "/positions");
    expect(text).toContain(mint);
  });

  it("/positions reports no open positions when none exist", async () => {
    const { db } = fakeDb({ openPositions: [] });
    const text = await handleCommand({ db, paperMode: true, maxConcurrent: 3 }, "/positions");
    expect(text).toContain("No open positions");
  });

  it("/pause sets paused=true via upsert", async () => {
    const { db, updateOne } = fakeDb({});
    const text = await handleCommand({ db, paperMode: true, maxConcurrent: 3 }, "/pause");
    expect(updateOne).toHaveBeenCalledWith(
      { _id: "singleton" },
      { $set: expect.objectContaining({ paused: true }) },
      { upsert: true },
    );
    expect(text).toContain("Paused");
  });

  it("/resume sets paused=false via upsert", async () => {
    const { db, updateOne } = fakeDb({});
    const text = await handleCommand({ db, paperMode: true, maxConcurrent: 3 }, "/resume");
    expect(updateOne).toHaveBeenCalledWith(
      { _id: "singleton" },
      { $set: expect.objectContaining({ paused: false }) },
      { upsert: true },
    );
    expect(text).toContain("Resumed");
  });

  it("/kill sets both killed and paused to true", async () => {
    const { db, updateOne } = fakeDb({});
    const text = await handleCommand({ db, paperMode: true, maxConcurrent: 3 }, "/kill");
    expect(updateOne).toHaveBeenCalledWith(
      { _id: "singleton" },
      { $set: expect.objectContaining({ killed: true, paused: true }) },
      { upsert: true },
    );
    expect(text).toContain("Killed");
  });

  it("handles a bot-suffixed command like /status@my_bot", async () => {
    const { db } = fakeDb({});
    const text = await handleCommand({ db, paperMode: true, maxConcurrent: 3 }, "/status@my_bot");
    expect(text).toContain("Status");
  });

  it("returns a helpful message for an unrecognized command", async () => {
    const { db } = fakeDb({});
    const text = await handleCommand({ db, paperMode: true, maxConcurrent: 3 }, "/nonsense");
    expect(text).toContain("Unknown command");
  });
});
