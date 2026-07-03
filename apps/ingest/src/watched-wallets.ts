import { watchedWalletsCollection } from "@memebot/db";
import type { Db } from "@memebot/db";

export async function loadWatchedWallets(db: Db): Promise<Map<string, string>> {
  const docs = await watchedWalletsCollection(db).find({ active: true }).toArray();
  return new Map(docs.map((doc) => [doc.address, doc.label]));
}
