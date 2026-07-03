import { deployersCollection } from "@memebot/db";
import type { Db } from "@memebot/db";

export interface DeployerStats {
  rugCount: number;
  tokenCount: number;
}

export async function getOrCreateDeployerStats(
  db: Db,
  address: string,
  firstSeen: Date,
): Promise<DeployerStats> {
  const deployers = deployersCollection(db);
  const existing = await deployers.findOne({ address });
  if (existing) {
    return { rugCount: existing.rugCount, tokenCount: existing.tokenCount };
  }
  await deployers.insertOne({ address, firstSeen, rugCount: 0, tokenCount: 0 });
  return { rugCount: 0, tokenCount: 0 };
}

export async function incrementDeployerTokenCount(db: Db, address: string): Promise<void> {
  await deployersCollection(db).updateOne({ address }, { $inc: { tokenCount: 1 } });
}
