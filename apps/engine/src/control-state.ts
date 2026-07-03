import { ENGINE_CONTROL_DOC_ID, engineControlCollection, type Db } from "@memebot/db";
import type { Logger } from "pino";

export interface ControlState {
  isHalted(now?: number): Promise<boolean>;
}

/**
 * Caches the engine_control singleton (paused/killed, written by the
 * notifier's /pause /resume /kill commands) for ttlMs so the trader isn't
 * hitting Mongo on every single trade tick. Falls back to the last known
 * state on a read failure, rather than failing open.
 */
export class ControlStateCache implements ControlState {
  private cached = { paused: false, killed: false };
  private cachedAt = -Infinity;

  constructor(
    private readonly db: Db,
    private readonly ttlMs: number,
    private readonly logger: Logger,
  ) {}

  async isHalted(now: number = Date.now()): Promise<boolean> {
    if (now - this.cachedAt >= this.ttlMs) {
      try {
        const doc = await engineControlCollection(this.db).findOne({ _id: ENGINE_CONTROL_DOC_ID });
        this.cached = doc ? { paused: doc.paused, killed: doc.killed } : { paused: false, killed: false };
        this.cachedAt = now;
      } catch (err) {
        this.logger.error({ err }, "failed to refresh engine control state; using last known state");
      }
    }
    return this.cached.paused || this.cached.killed;
  }
}
