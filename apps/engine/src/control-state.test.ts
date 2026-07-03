import type { Db } from "@memebot/db";
import type { Logger } from "pino";
import { describe, expect, it, vi } from "vitest";
import { ControlStateCache } from "./control-state.js";

function fakeDb(doc: { paused: boolean; killed: boolean } | null) {
  const findOne = vi.fn().mockResolvedValue(doc);
  const collection = vi.fn().mockReturnValue({ findOne });
  return { db: { collection } as unknown as Db, findOne };
}

function fakeLogger(): Logger {
  return { warn: vi.fn(), info: vi.fn(), error: vi.fn() } as unknown as Logger;
}

describe("ControlStateCache", () => {
  it("reports not halted when no control document exists", async () => {
    const { db } = fakeDb(null);
    const cache = new ControlStateCache(db, 5000, fakeLogger());
    expect(await cache.isHalted(0)).toBe(false);
  });

  it("reports halted when paused is true", async () => {
    const { db } = fakeDb({ paused: true, killed: false });
    const cache = new ControlStateCache(db, 5000, fakeLogger());
    expect(await cache.isHalted(0)).toBe(true);
  });

  it("reports halted when killed is true", async () => {
    const { db } = fakeDb({ paused: false, killed: true });
    const cache = new ControlStateCache(db, 5000, fakeLogger());
    expect(await cache.isHalted(0)).toBe(true);
  });

  it("does not re-query within the TTL window", async () => {
    const { db, findOne } = fakeDb({ paused: false, killed: false });
    const cache = new ControlStateCache(db, 5000, fakeLogger());

    await cache.isHalted(0);
    await cache.isHalted(1000);
    expect(findOne).toHaveBeenCalledTimes(1);
  });

  it("re-queries once the TTL has elapsed", async () => {
    const { db, findOne } = fakeDb({ paused: false, killed: false });
    const cache = new ControlStateCache(db, 5000, fakeLogger());

    await cache.isHalted(0);
    await cache.isHalted(6000);
    expect(findOne).toHaveBeenCalledTimes(2);
  });

  it("falls back to the last known state on a read failure", async () => {
    const db = {
      collection: vi.fn().mockReturnValue({
        findOne: vi
          .fn()
          .mockResolvedValueOnce({ paused: true, killed: false })
          .mockRejectedValueOnce(new Error("mongo down")),
      }),
    } as unknown as Db;
    const logger = fakeLogger();
    const cache = new ControlStateCache(db, 0, logger);

    expect(await cache.isHalted(0)).toBe(true);
    expect(await cache.isHalted(1)).toBe(true);
    expect(logger.error).toHaveBeenCalled();
  });
});
