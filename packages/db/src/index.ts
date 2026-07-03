import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

export function createDbClient(connectionString: string) {
  const client = postgres(connectionString);
  return drizzle(client);
}
