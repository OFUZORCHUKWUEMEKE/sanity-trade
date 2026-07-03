import type { Db } from "@memebot/db";
import type { Connection } from "@solana/web3.js";
import type { Logger } from "pino";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MintStatsTracker } from "./mint-stats.js";

vi.mock("./solana-rpc.js", () => ({
  fetchMintAuthorities: vi.fn(),
  fetchHolderConcentration: vi.fn(),
}));
vi.mock("./deployer-repo.js", () => ({
  getOrCreateDeployerStats: vi.fn(),
}));
vi.mock("./rugcheck.js", () => ({
  fetchRugCheckReport: vi.fn(),
}));

const mint = "So11111111111111111111111111111111111111112";
const deployer = "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM";

function fakeDb() {
  const insertOne = vi.fn().mockResolvedValue(undefined);
  const collection = vi.fn().mockReturnValue({ insertOne });
  return { db: { collection } as unknown as Db, insertOne };
}

function fakeLogger(): Logger {
  return { warn: vi.fn(), info: vi.fn(), error: vi.fn() } as unknown as Logger;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("scoreToken", () => {
  it("combines all checks and persists a passing score", async () => {
    const { fetchMintAuthorities, fetchHolderConcentration } = await import("./solana-rpc.js");
    const { getOrCreateDeployerStats } = await import("./deployer-repo.js");
    const { fetchRugCheckReport } = await import("./rugcheck.js");
    const { scoreToken } = await import("./scorer.js");

    vi.mocked(fetchMintAuthorities).mockResolvedValue({
      mintAuthority: null,
      freezeAuthority: null,
    });
    vi.mocked(fetchHolderConcentration).mockResolvedValue({
      top10HolderPercent: 20,
      clusterDetected: false,
    });
    vi.mocked(getOrCreateDeployerStats).mockResolvedValue({ rugCount: 0, tokenCount: 2 });
    vi.mocked(fetchRugCheckReport).mockResolvedValue({ rugCheckScore: 90, riskLevel: "low" });

    const { db, insertOne } = fakeDb();
    const mintStats = new MintStatsTracker();

    await scoreToken(
      {
        db,
        connection: {} as Connection,
        mintStats,
        logger: fakeLogger(),
        rateLimitDelayMs: 0,
        rugCheckBaseUrl: "https://example.invalid",
      },
      mint,
      deployer,
    );

    expect(insertOne).toHaveBeenCalledTimes(1);
    const row = insertOne.mock.calls[0]![0];
    expect(row.mint).toBe(mint);
    expect(row.hardRejected).toBe(false);
    expect(row.checks).toHaveLength(5);
  });

  it("hard rejects when the mint authority is still active", async () => {
    const { fetchMintAuthorities, fetchHolderConcentration } = await import("./solana-rpc.js");
    const { getOrCreateDeployerStats } = await import("./deployer-repo.js");
    const { fetchRugCheckReport } = await import("./rugcheck.js");
    const { scoreToken } = await import("./scorer.js");

    vi.mocked(fetchMintAuthorities).mockResolvedValue({
      mintAuthority: "someAuthority",
      freezeAuthority: null,
    });
    vi.mocked(fetchHolderConcentration).mockResolvedValue({
      top10HolderPercent: 20,
      clusterDetected: false,
    });
    vi.mocked(getOrCreateDeployerStats).mockResolvedValue({ rugCount: 0, tokenCount: 0 });
    vi.mocked(fetchRugCheckReport).mockResolvedValue(undefined);

    const { db, insertOne } = fakeDb();
    const mintStats = new MintStatsTracker();

    await scoreToken(
      {
        db,
        connection: {} as Connection,
        mintStats,
        logger: fakeLogger(),
        rateLimitDelayMs: 0,
        rugCheckBaseUrl: "https://example.invalid",
      },
      mint,
      deployer,
    );

    const row = insertOne.mock.calls[0]![0];
    expect(row.hardRejected).toBe(true);
    expect(row.checks).toHaveLength(4);
  });

  it("hard rejects (fail-safe) when an on-chain read throws instead of skipping the check", async () => {
    const { fetchMintAuthorities, fetchHolderConcentration } = await import("./solana-rpc.js");
    const { getOrCreateDeployerStats } = await import("./deployer-repo.js");
    const { fetchRugCheckReport } = await import("./rugcheck.js");
    const { scoreToken } = await import("./scorer.js");

    vi.mocked(fetchMintAuthorities).mockRejectedValue(new Error("RPC timeout"));
    vi.mocked(fetchHolderConcentration).mockResolvedValue({
      top10HolderPercent: 20,
      clusterDetected: false,
    });
    vi.mocked(getOrCreateDeployerStats).mockResolvedValue({ rugCount: 0, tokenCount: 0 });
    vi.mocked(fetchRugCheckReport).mockResolvedValue(undefined);

    const { db, insertOne } = fakeDb();
    const mintStats = new MintStatsTracker();

    await scoreToken(
      {
        db,
        connection: {} as Connection,
        mintStats,
        logger: fakeLogger(),
        rateLimitDelayMs: 0,
        rugCheckBaseUrl: "https://example.invalid",
      },
      mint,
      deployer,
    );

    const row = insertOne.mock.calls[0]![0];
    expect(row.hardRejected).toBe(true);
    const mintCheck = row.checks.find((c: { check: string }) => c.check === "mintAuthority");
    expect(mintCheck.reason).toContain("RPC timeout");
  });

  it("proceeds without a rugCheck row when RugCheck is unavailable", async () => {
    const { fetchMintAuthorities, fetchHolderConcentration } = await import("./solana-rpc.js");
    const { getOrCreateDeployerStats } = await import("./deployer-repo.js");
    const { fetchRugCheckReport } = await import("./rugcheck.js");
    const { scoreToken } = await import("./scorer.js");

    vi.mocked(fetchMintAuthorities).mockResolvedValue({
      mintAuthority: null,
      freezeAuthority: null,
    });
    vi.mocked(fetchHolderConcentration).mockResolvedValue({
      top10HolderPercent: 20,
      clusterDetected: false,
    });
    vi.mocked(getOrCreateDeployerStats).mockResolvedValue({ rugCount: 0, tokenCount: 0 });
    vi.mocked(fetchRugCheckReport).mockResolvedValue(undefined);

    const { db, insertOne } = fakeDb();
    const mintStats = new MintStatsTracker();
    const logger = fakeLogger();

    await scoreToken(
      {
        db,
        connection: {} as Connection,
        mintStats,
        logger,
        rateLimitDelayMs: 0,
        rugCheckBaseUrl: "https://example.invalid",
      },
      mint,
      deployer,
    );

    const row = insertOne.mock.calls[0]![0];
    expect(row.checks).toHaveLength(4);
    expect(logger.warn).toHaveBeenCalled();
  });
});
