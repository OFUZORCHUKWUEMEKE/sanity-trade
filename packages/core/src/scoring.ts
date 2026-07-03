export interface CheckResult {
  check: string;
  score: number;
  reason: string;
  hardReject: boolean;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * Check 1: mint/freeze authority revoked. A live mint authority lets the
 * deployer print more supply; a live freeze authority lets them freeze
 * holder accounts. Either one still set is an automatic hard reject.
 */
export function scoreMintAuthority(input: {
  mintAuthority: string | null;
  freezeAuthority: string | null;
}): CheckResult {
  const mintRevoked = input.mintAuthority === null;
  const freezeRevoked = input.freezeAuthority === null;

  if (!mintRevoked || !freezeRevoked) {
    const issues = [
      !mintRevoked && "mint authority still active",
      !freezeRevoked && "freeze authority still active",
    ].filter(Boolean);
    return {
      check: "mintAuthority",
      score: 0,
      reason: issues.join("; "),
      hardReject: true,
    };
  }

  return {
    check: "mintAuthority",
    score: 100,
    reason: "mint and freeze authorities revoked",
    hardReject: false,
  };
}

/**
 * Check 2: deployer reputation. Any prior rug is an automatic hard reject.
 * A clean track record with more shipped tokens scores higher; an unknown
 * (first-seen) deployer is scored neutral.
 */
export function scoreDeployerHistory(input: { rugCount: number; tokenCount: number }): CheckResult {
  if (input.rugCount > 0) {
    return {
      check: "deployerHistory",
      score: 0,
      reason: `deployer has ${input.rugCount} prior rug(s)`,
      hardReject: true,
    };
  }

  if (input.tokenCount === 0) {
    return {
      check: "deployerHistory",
      score: 50,
      reason: "first-seen deployer, no history",
      hardReject: false,
    };
  }

  const score = clamp(50 + input.tokenCount * 5, 50, 100);
  return {
    check: "deployerHistory",
    score,
    reason: `${input.tokenCount} prior token(s), no rugs`,
    hardReject: false,
  };
}

/**
 * Check 3: holder concentration. Top-10 holders controlling most of supply,
 * or a bundle/cluster of wallets funded from a common source, both signal
 * an engineered launch rather than organic demand.
 */
export function scoreHolderConcentration(input: {
  top10HolderPercent: number;
  clusterDetected: boolean;
}): CheckResult {
  if (input.clusterDetected) {
    return {
      check: "holderConcentration",
      score: 0,
      reason: "bundled/clustered wallet pattern detected in top holders",
      hardReject: true,
    };
  }

  if (input.top10HolderPercent > 70) {
    return {
      check: "holderConcentration",
      score: 0,
      reason: `top-10 holders control ${input.top10HolderPercent.toFixed(1)}% of supply`,
      hardReject: true,
    };
  }

  const score = clamp(100 - input.top10HolderPercent, 0, 100);
  return {
    check: "holderConcentration",
    score,
    reason: `top-10 holders control ${input.top10HolderPercent.toFixed(1)}% of supply`,
    hardReject: false,
  };
}

/**
 * Check 4: momentum signal. Curve progress velocity (% per minute since
 * launch) and unique buyer count. This is a positive-signal check only —
 * slow momentum is a low score, never a hard reject.
 */
export function scoreCurveVelocity(input: {
  curveProgressPercent: number;
  uniqueBuyers: number;
  minutesSinceLaunch: number;
}): CheckResult {
  const elapsedMinutes = Math.max(input.minutesSinceLaunch, 0.5);
  const velocityPerMinute = input.curveProgressPercent / elapsedMinutes;
  const score = clamp(velocityPerMinute * 10 + input.uniqueBuyers * 2, 0, 100);

  return {
    check: "curveVelocity",
    score,
    reason: `${velocityPerMinute.toFixed(2)}%/min curve progress, ${input.uniqueBuyers} unique buyers`,
    hardReject: false,
  };
}

/**
 * Check 5: RugCheck API, a secondary opinion. Per CLAUDE.md this must never
 * be the sole gate, so it never hard-rejects on its own — only contributes
 * to the aggregate score.
 */
export function scoreRugCheck(input: {
  rugCheckScore: number;
  riskLevel: "low" | "medium" | "high" | "danger";
}): CheckResult {
  return {
    check: "rugCheck",
    score: clamp(input.rugCheckScore, 0, 100),
    reason: `RugCheck risk level: ${input.riskLevel}`,
    hardReject: false,
  };
}

export interface ScorePipelineResult {
  checks: CheckResult[];
  total: number;
  hardRejected: boolean;
  reasons: string[];
}

/**
 * Combines individual check results into a single score row. Any hard
 * reject wins regardless of the numeric total, since a single disqualifying
 * signal (live mint authority, known rug deployer, bundled holders) should
 * never be averaged away by otherwise-good scores.
 */
export function combineScores(checks: CheckResult[]): ScorePipelineResult {
  const hardRejected = checks.some((c) => c.hardReject);
  const total = checks.length === 0 ? 0 : checks.reduce((sum, c) => sum + c.score, 0) / checks.length;
  const reasons = checks.map((c) => c.reason);

  return { checks, total, hardRejected, reasons };
}
