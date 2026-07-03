import { MongoClient, type Db } from "mongodb";

export function createDbClient(connectionString: string): { client: MongoClient; db: Db } {
  const client = new MongoClient(connectionString);
  return { client, db: client.db() };
}
