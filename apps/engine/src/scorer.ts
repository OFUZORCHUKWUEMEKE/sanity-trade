import {
  combineScores,
  scoreCurveVelocity,
  scoreDeployerHistory,
  scoreHolderConcentration,
  scoreMintAuthority,
  scoreRugCheck,
  type CheckResult,
} from "@memebot/core";
import { tokenScoresCollection, type Db } from "@memebot/db";
import type { Connection } from "@solana/web3.js";
import type { Logger } from "pino";
import { getOrCreateDeployerStats } from "./deployer-repo.js";
import type { MintStatsTracker } from "./mint-stats.js";
import { fetchRugCheckReport } from "./rugcheck.js";
import { fetchHolderConcentration, fetchMintAuthorities } from "./solana-rpc.js";

export interface ScorerDeps {
  db: Db;
  connection: Connection;
  mintStats: MintStatsTracker;
  logger: Logger;
  rateLimitDelayMs: number;
  rugCheckBaseUrl: string;
}

/** Conservative fallback when an on-chain/DB read fails: hard reject rather
 * than silently skip, since Phase 1's risk controls are non-negotiable. */
function unavailableCheck(check: string, err: unknown): CheckResult {
  const message = err instanceof Error ? err.message : String(err);
  return {
    check,
    score: 0,
    reason: `${check} unavailable: ${message}`,
    hardReject: true,
  };
}

export async function scoreToken(deps: ScorerDeps, mint: string, deployer: string): Promise<void> {
  const now = new Date();
  const checks: CheckResult[] = [];

  try {
    const authorities = await fetchMintAuthorities(deps.connection, mint);
    checks.push(scoreMintAuthority(authorities));
  } catch (err) {
    checks.push(unavailableCheck("mintAuthority", err));
  }

  try {
    const deployerStats = await getOrCreateDeployerStats(deps.db, deployer, now);
    checks.push(scoreDeployerHistory(deployerStats));
  } catch (err) {
    checks.push(unavailableCheck("deployerHistory", err));
  }

  try {
    const concentration = await fetchHolderConcentration(deps.connection, mint, deps.rateLimitDelayMs);
    checks.push(scoreHolderConcentration(concentration));
  } catch (err) {
    checks.push(unavailableCheck("holderConcentration", err));
  }

  checks.push(
    scoreCurveVelocity({
      curveProgressPercent: deps.mintStats.curveProgressPercent(mint),
      uniqueBuyers: deps.mintStats.get(mint)?.uniqueBuyers.size ?? 0,
      minutesSinceLaunch: deps.mintStats.minutesSinceLaunch(mint, now),
    }),
  );

  const rugCheck = await fetchRugCheckReport(mint, { baseUrl: deps.rugCheckBaseUrl });
  if (rugCheck) {
    checks.push(scoreRugCheck(rugCheck));
  } else {
    deps.logger.warn({ mint }, "RugCheck unavailable, scoring without it");
  }

  const result = combineScores(checks);

  await tokenScoresCollection(deps.db).insertOne({
    mint,
    checkedAt: now,
    checks: result.checks,
    total: result.total,
    hardRejected: result.hardRejected,
    reasons: result.reasons,
  });

  deps.logger.info(
    { mint, total: result.total, hardRejected: result.hardRejected },
    "scored token",
  );
}
