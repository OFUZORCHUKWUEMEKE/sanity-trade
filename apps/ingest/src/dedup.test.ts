import type { Redis } from "ioredis";
import { describe, expect, it, vi } from "vitest";
import { dedupKeyForSignature, isDuplicate } from "./dedup.js";

function fakeRedis(setResult: string | null) {
  const set = vi.fn().mockResolvedValue(setResult);
  return { redis: { set } as unknown as Redis, set };
}

describe("isDuplicate", () => {
  it("returns false and claims the key when it is new", async () => {
    const { redis, set } = fakeRedis("OK");
    const result = await isDuplicate(redis, "memebot:dedup:sig1", 600);
    expect(result).toBe(false);
    expect(set).toHaveBeenCalledWith("memebot:dedup:sig1", "1", "EX", 600, "NX");
  });

  it("returns true when the key already exists", async () => {
    const { redis } = fakeRedis(null);
    const result = await isDuplicate(redis, "memebot:dedup:sig1", 600);
    expect(result).toBe(true);
  });
});

describe("dedupKeyForSignature", () => {
  it("namespaces the signature", () => {
    expect(dedupKeyForSignature("abc123")).toBe("memebot:dedup:abc123");
  });
});
