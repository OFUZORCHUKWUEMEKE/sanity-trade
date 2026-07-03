import { z } from "zod";

export interface RugCheckResult {
  rugCheckScore: number;
  riskLevel: "low" | "medium" | "high" | "danger";
}

// RugCheck's public report shape is not fully stable; parse loosely and
// tolerate missing fields rather than throwing.
const rugCheckReportSchema = z.object({
  score: z.number().optional(),
  score_normalised: z.number().optional(),
  risks: z.array(z.object({ level: z.string().optional() })).optional(),
});

function riskLevelFromRisks(
  risks: { level?: string | undefined }[] | undefined,
): RugCheckResult["riskLevel"] {
  const levels = (risks ?? []).map((r) => r.level?.toLowerCase());
  if (levels.includes("danger")) return "danger";
  if (levels.includes("high")) return "high";
  if (levels.includes("medium") || levels.includes("warn")) return "medium";
  return "low";
}

/**
 * Fetches RugCheck's report for a mint. Returns undefined (rather than
 * throwing) on any network error, timeout, or non-2xx response, since
 * CLAUDE.md requires RugCheck to be a secondary opinion, never a required
 * gate - the rest of the scoring pipeline must proceed without it.
 */
export async function fetchRugCheckReport(
  mint: string,
  opts?: { baseUrl?: string; timeoutMs?: number },
): Promise<RugCheckResult | undefined> {
  const baseUrl = opts?.baseUrl ?? "https://api.rugcheck.xyz/v1";
  const timeoutMs = opts?.timeoutMs ?? 5_000;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`${baseUrl}/tokens/${mint}/report`, {
      signal: controller.signal,
    });
    if (!response.ok) {
      return undefined;
    }
    const json: unknown = await response.json();
    const parsed = rugCheckReportSchema.safeParse(json);
    if (!parsed.success) {
      return undefined;
    }

    const rawScore = parsed.data.score_normalised ?? parsed.data.score ?? 50;
    // RugCheck's raw `score` is a risk score (higher = riskier); normalize to
    // our 0-100 "healthiness" scale used by the rest of the pipeline.
    const rugCheckScore = Math.max(0, Math.min(100, 100 - rawScore));

    return {
      rugCheckScore,
      riskLevel: riskLevelFromRisks(parsed.data.risks),
    };
  } catch {
    return undefined;
  } finally {
    clearTimeout(timeout);
  }
}
