import { rawEventsCollection } from "@memebot/db";
import type { Db } from "@memebot/db";

export async function persistRawEvent(
  db: Db,
  source: string,
  type: string,
  payload: unknown,
  receivedAt: Date,
): Promise<void> {
  await rawEventsCollection(db).insertOne({ source, type, payload, receivedAt });
}
