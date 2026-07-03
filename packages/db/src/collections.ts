import type { ObjectId } from "mongodb";

export const COLLECTIONS = {
  rawEvents: "raw_events",
  tokens: "tokens",
  deployers: "deployers",
  tokenScores: "token_scores",
  paperTrades: "paper_trades",
  watchedWallets: "watched_wallets",
  openPositions: "open_positions",
  engineControl: "engine_control",
} as const;

export interface RawEventDoc {
  _id?: ObjectId;
  source: string;
  type: string;
  payload: unknown;
  receivedAt: Date;
}

export interface TokenDoc {
  _id?: ObjectId;
  mint: string;
  deployer: string;
  name: string;
  symbol: string;
  uri?: string;
  launchedAt: Date;
  metadata?: Record<string, unknown>;
}

export interface DeployerDoc {
  _id?: ObjectId;
  address: string;
  firstSeen: Date;
  rugCount: number;
  tokenCount: number;
}

export interface ScoreCheck {
  check: string;
  score: number;
  reason: string;
  hardReject: boolean;
}

export interface TokenScoreDoc {
  _id?: ObjectId;
  mint: string;
  checkedAt: Date;
  checks: ScoreCheck[];
  total: number;
  hardRejected: boolean;
  reasons: string[];
}

export interface PaperTradeDoc {
  _id?: ObjectId;
  mint: string;
  entryAt: Date;
  entryPrice: number;
  exitAt?: Date;
  exitPrice?: number;
  sizeSol: number;
  pnlSol?: number;
  entryReason: string;
  exitReason?: string;
  simulatedFeesSol: number;
  simulatedSlippageSol: number;
}

export interface WatchedWalletDoc {
  _id?: ObjectId;
  address: string;
  label: string;
  addedAt: Date;
  active: boolean;
}

/** Read model for the currently-open paper position on a mint, so the
 * notifier (a separate process from the engine) can answer /positions
 * without needing access to the engine's in-memory state. */
export interface OpenPositionDoc {
  _id?: ObjectId;
  mint: string;
  deployer: string;
  entryAt: Date;
  entryPrice: number;
  originalSizeSol: number;
  remainingSizeSol: number;
  peakPriceSol: number;
  tookInitialTakeProfit: boolean;
  entryReason: string;
  updatedAt: Date;
}

/** Singleton control document (single row, fixed _id) the notifier's
 * /pause /resume /kill commands write to and the engine reads before
 * opening any new paper position - CLAUDE.md's "global kill switch via
 * Telegram command" risk rule. */
export const ENGINE_CONTROL_DOC_ID = "singleton";

export interface EngineControlDoc {
  _id: string;
  paused: boolean;
  killed: boolean;
  updatedAt: Date;
  updatedBy?: string;
}
