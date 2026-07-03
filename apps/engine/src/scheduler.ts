export type ScheduleFn = (callback: () => void, delayMs: number) => unknown;

/**
 * Schedules a rescoring pass at each delay in `delaysMs` after launch
 * (CLAUDE.md calls for T+60s and T+5min). `scheduleFn` is injectable so
 * tests don't need real timers.
 */
export function scheduleRescoring(
  mint: string,
  deployer: string,
  delaysMs: number[],
  scoreFn: (mint: string, deployer: string) => void,
  scheduleFn: ScheduleFn = setTimeout,
): void {
  for (const delayMs of delaysMs) {
    scheduleFn(() => scoreFn(mint, deployer), delayMs);
  }
}
