import type { Connection } from "@solana/web3.js";
import { PublicKey } from "@solana/web3.js";
import { describe, expect, it, vi } from "vitest";
import { fetchHolderConcentration, fetchMintAuthorities } from "./solana-rpc.js";

const mint = "So11111111111111111111111111111111111111112";

vi.mock("@solana/spl-token", () => ({
  getMint: vi.fn(),
}));

describe("fetchMintAuthorities", () => {
  it("maps revoked authorities to null", async () => {
    const { getMint } = await import("@solana/spl-token");
    vi.mocked(getMint).mockResolvedValue({
      mintAuthority: null,
      freezeAuthority: null,
    } as never);

    const result = await fetchMintAuthorities({} as Connection, mint);
    expect(result).toEqual({ mintAuthority: null, freezeAuthority: null });
  });

  it("maps active authorities to their base58 address", async () => {
    const { getMint } = await import("@solana/spl-token");
    const authorityKey = new PublicKey("9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM");
    vi.mocked(getMint).mockResolvedValue({
      mintAuthority: authorityKey,
      freezeAuthority: null,
    } as never);

    const result = await fetchMintAuthorities({} as Connection, mint);
    expect(result.mintAuthority).toBe(authorityKey.toBase58());
    expect(result.freezeAuthority).toBeNull();
  });
});

function fakeConnection(opts: {
  largestAccounts: { address: PublicKey; uiAmount: number | null }[];
  totalUiAmount: number;
  owners: Map<string, string>;
}): Connection {
  return {
    getTokenLargestAccounts: vi.fn().mockResolvedValue({ value: opts.largestAccounts }),
    getTokenSupply: vi.fn().mockResolvedValue({ value: { uiAmount: opts.totalUiAmount } }),
    getParsedAccountInfo: vi.fn().mockImplementation((address: PublicKey) =>
      Promise.resolve({
        value: {
          data: {
            parsed: { info: { owner: opts.owners.get(address.toBase58()) } },
          },
        },
      }),
    ),
  } as unknown as Connection;
}

describe("fetchHolderConcentration", () => {
  const addrA = new PublicKey("9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM");
  const addrB = new PublicKey("5Q544fKrFoe6tsEbD7S8EmxGTJYAKtTVhAW5Q5pge4j1");
  const addrC = new PublicKey("7Q544fKrFoe6tsEbD7S8EmxGTJYAKtTVhAW5Q5pge4j2");

  it("computes top-10 holder percent relative to supply", async () => {
    const connection = fakeConnection({
      largestAccounts: [
        { address: addrA, uiAmount: 40 },
        { address: addrB, uiAmount: 20 },
      ],
      totalUiAmount: 100,
      owners: new Map([
        [addrA.toBase58(), "ownerA"],
        [addrB.toBase58(), "ownerB"],
      ]),
    });

    const result = await fetchHolderConcentration(connection, mint, 0);
    expect(result.top10HolderPercent).toBe(60);
  });

  it("does not flag a cluster when top holders are distinct wallets", async () => {
    const connection = fakeConnection({
      largestAccounts: [
        { address: addrA, uiAmount: 10 },
        { address: addrB, uiAmount: 10 },
        { address: addrC, uiAmount: 10 },
      ],
      totalUiAmount: 100,
      owners: new Map([
        [addrA.toBase58(), "ownerA"],
        [addrB.toBase58(), "ownerB"],
        [addrC.toBase58(), "ownerC"],
      ]),
    });

    const result = await fetchHolderConcentration(connection, mint, 0);
    expect(result.clusterDetected).toBe(false);
  });

  it("flags a cluster when top holders collapse into very few distinct owners", async () => {
    const connection = fakeConnection({
      largestAccounts: [
        { address: addrA, uiAmount: 10 },
        { address: addrB, uiAmount: 10 },
        { address: addrC, uiAmount: 10 },
      ],
      totalUiAmount: 100,
      owners: new Map([
        [addrA.toBase58(), "sameOwner"],
        [addrB.toBase58(), "sameOwner"],
        [addrC.toBase58(), "sameOwner"],
      ]),
    });

    const result = await fetchHolderConcentration(connection, mint, 0);
    expect(result.clusterDetected).toBe(true);
  });

  it("returns 0 percent when reported supply is 0", async () => {
    const connection = fakeConnection({
      largestAccounts: [],
      totalUiAmount: 0,
      owners: new Map(),
    });

    const result = await fetchHolderConcentration(connection, mint, 0);
    expect(result.top10HolderPercent).toBe(0);
  });
});
