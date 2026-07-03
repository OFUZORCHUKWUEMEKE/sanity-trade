import type { Db } from "mongodb";
import { COLLECTIONS } from "./collections.js";

export async function ensureIndexes(db: Db): Promise<void> {
  await db
    .collection(COLLECTIONS.rawEvents)
    .createIndexes([
      { key: { receivedAt: 1 }, name: "receivedAt_1" },
      { key: { type: 1, receivedAt: 1 }, name: "type_1_receivedAt_1" },
    ]);

  await db
    .collection(COLLECTIONS.tokens)
    .createIndexes([{ key: { mint: 1 }, name: "mint_1", unique: true }]);

  await db
    .collection(COLLECTIONS.deployers)
    .createIndexes([{ key: { address: 1 }, name: "address_1", unique: true }]);

  await db
    .collection(COLLECTIONS.tokenScores)
    .createIndexes([
      { key: { mint: 1, checkedAt: 1 }, name: "mint_1_checkedAt_1" },
      { key: { hardRejected: 1 }, name: "hardRejected_1" },
    ]);

  await db
    .collection(COLLECTIONS.paperTrades)
    .createIndexes([
      { key: { mint: 1 }, name: "mint_1" },
      { key: { entryAt: 1 }, name: "entryAt_1" },
    ]);

  await db
    .collection(COLLECTIONS.watchedWallets)
    .createIndexes([
      { key: { address: 1 }, name: "address_1", unique: true },
      { key: { active: 1 }, name: "active_1" },
    ]);

  await db
    .collection(COLLECTIONS.openPositions)
    .createIndexes([{ key: { mint: 1 }, name: "mint_1", unique: true }]);
}
