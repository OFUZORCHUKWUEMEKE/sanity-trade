import type { NormalizedEvent } from "@memebot/core";
import type { Redis } from "ioredis";

export async function publishEvent(
  redis: Redis,
  streamKey: string,
  event: NormalizedEvent,
): Promise<void> {
  await redis.xadd(streamKey, "*", "event", JSON.stringify(event));
}
