import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchRugCheckReport } from "./rugcheck.js";

const mint = "So11111111111111111111111111111111111111112";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("fetchRugCheckReport", () => {
  it("normalizes a low-risk report", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ score: 10, risks: [] }),
      }),
    );

    const result = await fetchRugCheckReport(mint);
    expect(result).toEqual({ rugCheckScore: 90, riskLevel: "low" });
  });

  it("derives the highest risk level present", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ score: 80, risks: [{ level: "warn" }, { level: "danger" }] }),
      }),
    );

    const result = await fetchRugCheckReport(mint);
    expect(result?.riskLevel).toBe("danger");
  });

  it("returns undefined on a non-2xx response", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false }));
    const result = await fetchRugCheckReport(mint);
    expect(result).toBeUndefined();
  });

  it("returns undefined when the request throws (network error/timeout)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("network error")),
    );
    const result = await fetchRugCheckReport(mint);
    expect(result).toBeUndefined();
  });

  it("returns undefined when the response body doesn't match the expected shape", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ risks: "not-an-array" }),
      }),
    );
    const result = await fetchRugCheckReport(mint);
    expect(result).toBeUndefined();
  });
});
