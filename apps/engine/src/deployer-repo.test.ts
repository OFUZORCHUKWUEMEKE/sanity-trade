import type { Db } from "@memebot/db";
import { describe, expect, it, vi } from "vitest";
import { getOrCreateDeployerStats, incrementDeployerTokenCount } from "./deployer-repo.js";

function fakeDb(existing: { rugCount: number; tokenCount: number } | null) {
  const findOne = vi.fn().mockResolvedValue(existing);
  const insertOne = vi.fn().mockResolvedValue(undefined);
  const updateOne = vi.fn().mockResolvedValue(undefined);
  const collection = vi.fn().mockReturnValue({ findOne, insertOne, updateOne });
  const db = { collection } as unknown as Db;
  return { db, findOne, insertOne, updateOne };
}

describe("getOrCreateDeployerStats", () => {
  it("returns existing stats without inserting when the deployer is known", async () => {
    const { db, insertOne } = fakeDb({ rugCount: 2, tokenCount: 5 });
    const result = await getOrCreateDeployerStats(db, "addr1", new Date());
    expect(result).toEqual({ rugCount: 2, tokenCount: 5 });
    expect(insertOne).not.toHaveBeenCalled();
  });

  it("creates a fresh zeroed record for an unseen deployer", async () => {
    const { db, insertOne } = fakeDb(null);
    const result = await getOrCreateDeployerStats(db, "addr1", new Date());
    expect(result).toEqual({ rugCount: 0, tokenCount: 0 });
    expect(insertOne).toHaveBeenCalledWith(
      expect.objectContaining({ address: "addr1", rugCount: 0, tokenCount: 0 }),
    );
  });
});

describe("incrementDeployerTokenCount", () => {
  it("issues an $inc update on tokenCount", async () => {
    const { db, updateOne } = fakeDb(null);
    await incrementDeployerTokenCount(db, "addr1");
    expect(updateOne).toHaveBeenCalledWith({ address: "addr1" }, { $inc: { tokenCount: 1 } });
  });
});
