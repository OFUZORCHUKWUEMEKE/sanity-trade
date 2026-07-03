import { getMint } from "@solana/spl-token";
import { Connection, PublicKey } from "@solana/web3.js";

export function createSolanaConnection(rpcUrl: string): Connection {
  return new Connection(rpcUrl, "confirmed");
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export interface MintAuthorities {
  mintAuthority: string | null;
  freezeAuthority: string | null;
}

export async function fetchMintAuthorities(
  connection: Connection,
  mint: string,
): Promise<MintAuthorities> {
  const info = await getMint(connection, new PublicKey(mint));
  return {
    mintAuthority: info.mintAuthority ? info.mintAuthority.toBase58() : null,
    freezeAuthority: info.freezeAuthority ? info.freezeAuthority.toBase58() : null,
  };
}

export interface HolderConcentration {
  top10HolderPercent: number;
  clusterDetected: boolean;
}

/**
 * Resolves top-10 holder concentration and a coarse bundle/cluster signal:
 * if a handful of distinct wallets own most of the top-10 token accounts,
 * treat the launch as artificially concentrated. This is a heuristic, not a
 * funding-graph analysis - it catches the common "same wallet, many ATAs"
 * and "few wallets holding nearly everything" patterns, not sophisticated
 * bundling.
 */
export async function fetchHolderConcentration(
  connection: Connection,
  mint: string,
  rateLimitDelayMs = 250,
): Promise<HolderConcentration> {
  const mintPk = new PublicKey(mint);
  const [largest, supply] = await Promise.all([
    connection.getTokenLargestAccounts(mintPk),
    connection.getTokenSupply(mintPk),
  ]);

  const totalUi = supply.value.uiAmount ?? 0;
  const top10 = largest.value.slice(0, 10);
  const top10Ui = top10.reduce((sum, account) => sum + (account.uiAmount ?? 0), 0);
  const top10HolderPercent = totalUi > 0 ? (top10Ui / totalUi) * 100 : 0;

  const owners = new Set<string>();
  for (const [index, account] of top10.entries()) {
    if (index > 0) {
      await sleep(rateLimitDelayMs);
    }
    const accountInfo = await connection.getParsedAccountInfo(account.address);
    const data = accountInfo.value?.data;
    if (data && typeof data === "object" && "parsed" in data) {
      const owner = (data as { parsed: { info: { owner: string } } }).parsed.info.owner;
      owners.add(owner);
    }
  }

  const clusterDetected = top10.length >= 3 && owners.size <= Math.ceil(top10.length / 3);

  return { top10HolderPercent, clusterDetected };
}
