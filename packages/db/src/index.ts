import { MongoClient, type Collection, type Db } from "mongodb";
import { COLLECTIONS } from "./collections.js";
import type {
  DeployerDoc,
  PaperTradeDoc,
  RawEventDoc,
  TokenDoc,
  TokenScoreDoc,
  WatchedWalletDoc,
} from "./collections.js";

export * from "./collections.js";
export * from "./indexes.js";

export function createDbClient(connectionString: string): { client: MongoClient; db: Db } {
  const client = new MongoClient(connectionString);
  return { client, db: client.db() };
}

export function rawEventsCollection(db: Db): Collection<RawEventDoc> {
  return db.collection<RawEventDoc>(COLLECTIONS.rawEvents);
}

export function tokensCollection(db: Db): Collection<TokenDoc> {
  return db.collection<TokenDoc>(COLLECTIONS.tokens);
}

export function deployersCollection(db: Db): Collection<DeployerDoc> {
  return db.collection<DeployerDoc>(COLLECTIONS.deployers);
}

export function tokenScoresCollection(db: Db): Collection<TokenScoreDoc> {
  return db.collection<TokenScoreDoc>(COLLECTIONS.tokenScores);
}

export function paperTradesCollection(db: Db): Collection<PaperTradeDoc> {
  return db.collection<PaperTradeDoc>(COLLECTIONS.paperTrades);
}

export function watchedWalletsCollection(db: Db): Collection<WatchedWalletDoc> {
  return db.collection<WatchedWalletDoc>(COLLECTIONS.watchedWallets);
}
