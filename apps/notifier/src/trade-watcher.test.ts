import type { Db, PaperTradeDoc } from "@memebot/db";
import type { Logger } from "pino";
import { describe, expect, it, vi } from "vitest";
import { handleNewTrade } from "./trade-watcher.js";
import type { TelegramClient } from "./telegram-client.js";

const mint = "So11111111111111111111111111111111111111112";
const entryAt = new Date("2026-01-01T00:00:00.000Z");

function fakeDb(scoreDoc: unknown) {
  const next = vi.fn().mockResolvedValue(scoreDoc);
  const limit = vi.fn().mockReturnValue({ next });
  const sort = vi.fn().mockReturnValue({ limit });
  const find = vi.fn().mockReturnValue({ sort });
  const collection = vi.fn().mockReturnValue({ find });
  return { db: { collection } as unknown as Db, find };
}

function fakeLogger(): Logger {
  return { warn: vi.fn(), info: vi.fn(), error: vi.fn() } as unknown as Logger;
}

function tradeDoc(overrides?: Partial<PaperTradeDoc>): PaperTradeDoc {
  return {
    mint,
    entryAt,
    entryPrice: 0.0001,
    exitAt: new Date("2026-01-01T00:05:00.000Z"),
    exitPrice: 0.0002,
    sizeSol: 0.05,
    pnlSol: 0.02,
    entryReason: "score 91.0",
    exitReason: "take profit at 2x entry",
    simulatedFeesSol: 0.001,
    simulatedSlippageSol: 0.0005,
    ...overrides,
  };
}

describe("handleNewTrade", () => {
  it("looks up the most recent score at or before entry and sends a formatted alert", async () => {
    const scoreDoc = {
      mint,
      checkedAt: entryAt,
      checks: [{ check: "mintAuthority", score: 100, reason: "revoked", hardReject: false }],
      total: 90,
      hardRejected: false,
      reasons: [],
    };
    const { db, find } = fakeDb(scoreDoc);
    const sendMessage = vi.fn().mockResolvedValue(undefined);
    const telegram = { sendMessage } as unknown as TelegramClient;

    await handleNewTrade({ db, telegram, chatId: "chat1", logger: fakeLogger() }, tradeDoc());

    expect(find).toHaveBeenCalledWith({ mint, checkedAt: { $lte: entryAt } });
    expect(sendMessage).toHaveBeenCalledTimes(1);
    const [chatId, text] = sendMessage.mock.calls[0]!;
    expect(chatId).toBe("chat1");
    expect(text).toContain(mint);
    expect(text).toContain("mintAuthority");
  });

  it("sends an alert without a score breakdown when no score doc is found", async () => {
    const { db } = fakeDb(null);
    const sendMessage = vi.fn().mockResolvedValue(undefined);
    const telegram = { sendMessage } as unknown as TelegramClient;

    await handleNewTrade({ db, telegram, chatId: "chat1", logger: fakeLogger() }, tradeDoc());

    const text = sendMessage.mock.calls[0]![1];
    expect(text).not.toContain("Score breakdown");
  });

  it("logs and swallows an error instead of throwing when sendMessage fails", async () => {
    const { db } = fakeDb(null);
    const telegram = {
      sendMessage: vi.fn().mockRejectedValue(new Error("telegram down")),
    } as unknown as TelegramClient;
    const logger = fakeLogger();

    await expect(
      handleNewTrade({ db, telegram, chatId: "chat1", logger }, tradeDoc()),
    ).resolves.toBeUndefined();
    expect(logger.error).toHaveBeenCalled();
  });
});
