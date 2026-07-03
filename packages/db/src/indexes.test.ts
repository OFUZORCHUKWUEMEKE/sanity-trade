import type { Db } from "mongodb";
import { describe, expect, it, vi } from "vitest";
import { COLLECTIONS } from "./collections.js";
import { ensureIndexes } from "./indexes.js";

function fakeDb() {
  const createIndexes = vi.fn().mockResolvedValue(undefined);
  const collection = vi.fn().mockReturnValue({ createIndexes });
  const db = { collection } as unknown as Db;
  return { db, collection, createIndexes };
}

describe("ensureIndexes", () => {
  it("creates a unique mint index on tokens", async () => {
    const { db, collection, createIndexes } = fakeDb();
    await ensureIndexes(db);

    expect(collection).toHaveBeenCalledWith(COLLECTIONS.tokens);
    expect(createIndexes).toHaveBeenCalledWith([
      { key: { mint: 1 }, name: "mint_1", unique: true },
    ]);
  });

  it("creates a unique address index on watched_wallets plus an active index", async () => {
    const { db, collection, createIndexes } = fakeDb();
    await ensureIndexes(db);

    expect(collection).toHaveBeenCalledWith(COLLECTIONS.watchedWallets);
    expect(createIndexes).toHaveBeenCalledWith([
      { key: { address: 1 }, name: "address_1", unique: true },
      { key: { active: 1 }, name: "active_1" },
    ]);
  });

  it("touches every collection defined in COLLECTIONS", async () => {
    const { db, collection } = fakeDb();
    await ensureIndexes(db);

    for (const name of Object.values(COLLECTIONS)) {
      expect(collection).toHaveBeenCalledWith(name);
    }
  });
});
