import type { Redis } from "ioredis";

/**
 * Marks `key` as seen with the given TTL. Returns true if the key was
 * already present (i.e. this is a duplicate event), false if this call
 * newly claimed it.
 */
export async function isDuplicate(redis: Redis, key: string, ttlSeconds: number): Promise<boolean> {
  const result = await redis.set(key, "1", "EX", ttlSeconds, "NX");
  return result === null;
}

export function dedupKeyForSignature(signature: string): string {
  return `memebot:dedup:${signature}`;
}
