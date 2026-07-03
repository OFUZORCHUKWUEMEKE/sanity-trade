import { describe, expect, it, vi } from "vitest";
import { scheduleRescoring } from "./scheduler.js";

describe("scheduleRescoring", () => {
  it("schedules a callback for every configured delay", () => {
    const scheduleFn = vi.fn();
    const scoreFn = vi.fn();

    scheduleRescoring("mint1", "deployer1", [60_000, 300_000], scoreFn, scheduleFn);

    expect(scheduleFn).toHaveBeenCalledTimes(2);
    expect(scheduleFn).toHaveBeenNthCalledWith(1, expect.any(Function), 60_000);
    expect(scheduleFn).toHaveBeenNthCalledWith(2, expect.any(Function), 300_000);
  });

  it("invokes scoreFn with the mint and deployer when a scheduled callback fires", () => {
    let capturedCallback: (() => void) | undefined;
    const scheduleFn = vi.fn((cb: () => void) => {
      capturedCallback = cb;
    });
    const scoreFn = vi.fn();

    scheduleRescoring("mint1", "deployer1", [60_000], scoreFn, scheduleFn);
    capturedCallback?.();

    expect(scoreFn).toHaveBeenCalledWith("mint1", "deployer1");
  });
});
