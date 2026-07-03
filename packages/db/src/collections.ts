import type { ObjectId } from "mongodb";

export const COLLECTIONS = {
  rawEvents: "raw_events",
  tokens: "tokens",
  deployers: "deployers",
  tokenScores: "token_scores",
  paperTrades: "paper_trades",
  watchedWallets: "watched_wallets",
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
