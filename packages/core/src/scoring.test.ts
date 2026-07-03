import { describe, expect, it } from "vitest";
import {
  combineScores,
  scoreCurveVelocity,
  scoreDeployerHistory,
  scoreHolderConcentration,
  scoreMintAuthority,
  scoreRugCheck,
} from "./scoring.js";

describe("scoreMintAuthority", () => {
  it("scores 100 and does not hard reject when both authorities are revoked", () => {
    const result = scoreMintAuthority({ mintAuthority: null, freezeAuthority: null });
    expect(result.score).toBe(100);
    expect(result.hardReject).toBe(false);
  });

  it("hard rejects when mint authority is still active", () => {
    const result = scoreMintAuthority({ mintAuthority: "someKey", freezeAuthority: null });
    expect(result.hardReject).toBe(true);
    expect(result.score).toBe(0);
    expect(result.reason).toContain("mint authority");
  });

  it("hard rejects when freeze authority is still active", () => {
    const result = scoreMintAuthority({ mintAuthority: null, freezeAuthority: "someKey" });
    expect(result.hardReject).toBe(true);
    expect(result.reason).toContain("freeze authority");
  });

  it("hard rejects and lists both issues when neither authority is revoked", () => {
    const result = scoreMintAuthority({ mintAuthority: "a", freezeAuthority: "b" });
    expect(result.hardReject).toBe(true);
    expect(result.reason).toContain("mint authority");
    expect(result.reason).toContain("freeze authority");
  });
});

describe("scoreDeployerHistory", () => {
  it("hard rejects a deployer with prior rugs regardless of token count", () => {
    const result = scoreDeployerHistory({ rugCount: 1, tokenCount: 10 });
    expect(result.hardReject).toBe(true);
    expect(result.score).toBe(0);
  });

  it("scores a first-seen deployer neutrally", () => {
    const result = scoreDeployerHistory({ rugCount: 0, tokenCount: 0 });
    expect(result.hardReject).toBe(false);
    expect(result.score).toBe(50);
  });

  it("rewards a clean deployer with more shipped tokens, capped at 100", () => {
    const some = scoreDeployerHistory({ rugCount: 0, tokenCount: 3 });
    expect(some.score).toBe(65);

    const capped = scoreDeployerHistory({ rugCount: 0, tokenCount: 100 });
    expect(capped.score).toBe(100);
  });
});

describe("scoreHolderConcentration", () => {
  it("hard rejects when a cluster/bundle is detected regardless of percent", () => {
    const result = scoreHolderConcentration({ top10HolderPercent: 20, clusterDetected: true });
    expect(result.hardReject).toBe(true);
    expect(result.score).toBe(0);
  });

  it("hard rejects when top-10 holders exceed 70%", () => {
    const result = scoreHolderConcentration({ top10HolderPercent: 71, clusterDetected: false });
    expect(result.hardReject).toBe(true);
  });

  it("scores inversely to concentration below the threshold", () => {
    const result = scoreHolderConcentration({ top10HolderPercent: 30, clusterDetected: false });
    expect(result.hardReject).toBe(false);
    expect(result.score).toBe(70);
  });
});

describe("scoreCurveVelocity", () => {
  it("never hard rejects", () => {
    const result = scoreCurveVelocity({
      curveProgressPercent: 0,
      uniqueBuyers: 0,
      minutesSinceLaunch: 5,
    });
    expect(result.hardReject).toBe(false);
  });

  it("scores higher for faster curve progress and more unique buyers", () => {
    const slow = scoreCurveVelocity({
      curveProgressPercent: 5,
      uniqueBuyers: 2,
      minutesSinceLaunch: 5,
    });
    const fast = scoreCurveVelocity({
      curveProgressPercent: 50,
      uniqueBuyers: 20,
      minutesSinceLaunch: 5,
    });
    expect(fast.score).toBeGreaterThan(slow.score);
  });

  it("floors elapsed minutes to avoid divide-by-near-zero blowups", () => {
    const result = scoreCurveVelocity({
      curveProgressPercent: 10,
      uniqueBuyers: 0,
      minutesSinceLaunch: 0,
    });
    expect(result.score).toBeLessThanOrEqual(100);
    expect(Number.isFinite(result.score)).toBe(true);
  });
});

describe("scoreRugCheck", () => {
  it("never hard rejects, per CLAUDE.md (secondary opinion only)", () => {
    const result = scoreRugCheck({ rugCheckScore: 0, riskLevel: "danger" });
    expect(result.hardReject).toBe(false);
    expect(result.score).toBe(0);
  });

  it("passes through the score clamped to 0-100", () => {
    expect(scoreRugCheck({ rugCheckScore: 150, riskLevel: "low" }).score).toBe(100);
    expect(scoreRugCheck({ rugCheckScore: -10, riskLevel: "high" }).score).toBe(0);
  });
});

describe("combineScores", () => {
  it("averages scores and is not hard-rejected when no check hard rejects", () => {
    const result = combineScores([
      { check: "a", score: 80, reason: "", hardReject: false },
      { check: "b", score: 60, reason: "", hardReject: false },
    ]);
    expect(result.total).toBe(70);
    expect(result.hardRejected).toBe(false);
  });

  it("is hard-rejected if any single check hard rejects, even with high scores elsewhere", () => {
    const result = combineScores([
      { check: "a", score: 100, reason: "great", hardReject: false },
      { check: "b", score: 0, reason: "rug deployer", hardReject: true },
    ]);
    expect(result.hardRejected).toBe(true);
    expect(result.reasons).toContain("rug deployer");
  });

  it("returns a total of 0 for an empty check list", () => {
    expect(combineScores([]).total).toBe(0);
  });
});
