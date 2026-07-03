import type { Redis } from "ioredis";
import type { Logger } from "pino";
import { describe, expect, it, vi } from "vitest";
import { StreamConsumer } from "./stream-consumer.js";

const mint = "So11111111111111111111111111111111111111112";
const deployer = "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM";

function tokenLaunchedPayload() {
  return JSON.stringify({
    eventType: "TokenLaunched",
    mint,
    deployer,
    name: "Test",
    symbol: "TEST",
    source: "pumpfun",
    launchedAt: new Date().toISOString(),
  });
}

function fakeLogger(): Logger {
  return { warn: vi.fn(), info: vi.fn(), error: vi.fn() } as unknown as Logger;
}

// Resolves like a real Redis BLOCK call would: after a short real delay,
// rather than instantly, so a mocked "no new messages" response doesn't spin
// the consumer's while-loop as fast as the CPU allows.
function delayedNull(delayMs = 20): Promise<null> {
  return new Promise((resolve) => setTimeout(() => resolve(null), delayMs));
}

describe("StreamConsumer", () => {
  it("parses a valid stream entry and forwards it as a NormalizedEvent", async () => {
    const xread = vi
      .fn()
      .mockResolvedValueOnce([["memebot:events", [["1-0", ["event", tokenLaunchedPayload()]]]]])
      .mockImplementation(() => delayedNull());
    const redis = { xread } as unknown as Redis;
    const onEvent = vi.fn();
    const logger = fakeLogger();

    const consumer = new StreamConsumer(redis, "memebot:events", onEvent, logger, 10);
    const runPromise = consumer.start();

    await vi.waitFor(() => expect(onEvent).toHaveBeenCalledTimes(1));
    expect(onEvent).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: "TokenLaunched", mint }),
    );

    consumer.stop();
    await runPromise;
  });

  it("logs and skips an entry with an invalid payload instead of throwing", async () => {
    const xread = vi
      .fn()
      .mockResolvedValueOnce([["memebot:events", [["1-0", ["event", "not json"]]]]])
      .mockImplementation(() => delayedNull());
    const redis = { xread } as unknown as Redis;
    const onEvent = vi.fn();
    const logger = fakeLogger();

    const consumer = new StreamConsumer(redis, "memebot:events", onEvent, logger, 10);
    const runPromise = consumer.start();

    await vi.waitFor(() => expect(logger.warn).toHaveBeenCalled());
    expect(onEvent).not.toHaveBeenCalled();

    consumer.stop();
    await runPromise;
  });

  it("advances the last-seen id so re-reads don't reprocess old entries", async () => {
    const xread = vi.fn().mockImplementation(() => delayedNull());
    const redis = { xread } as unknown as Redis;
    const consumer = new StreamConsumer(redis, "memebot:events", vi.fn(), fakeLogger(), 10);

    const runPromise = consumer.start();
    await vi.waitFor(() => expect(xread).toHaveBeenCalled());
    expect(xread).toHaveBeenCalledWith("BLOCK", 10, "STREAMS", "memebot:events", "$");

    consumer.stop();
    await runPromise;
  });
});
