import type { Db } from "@memebot/db";
import type { Logger } from "pino";
import { describe, expect, it, vi } from "vitest";
import { CommandPoller } from "./command-poller.js";
import type { TelegramClient } from "./telegram-client.js";

function fakeLogger(): Logger {
  return { warn: vi.fn(), info: vi.fn(), error: vi.fn() } as unknown as Logger;
}

// Resolves after a short real delay so a "no updates" response doesn't spin
// the poller's while-loop as fast as the CPU allows (see stream-consumer.test.ts).
function delayed<T>(value: T, delayMs = 10): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), delayMs));
}

describe("CommandPoller", () => {
  it("dispatches an incoming command and replies in the same chat", async () => {
    const getUpdates = vi
      .fn()
      .mockResolvedValueOnce([
        { update_id: 1, message: { text: "/status", chat: { id: 42 } } },
      ])
      .mockImplementation(() => delayed([]));
    const sendMessage = vi.fn().mockResolvedValue(undefined);
    const telegram = { getUpdates, sendMessage } as unknown as TelegramClient;

    const findOne = vi.fn().mockResolvedValue(null);
    const countDocuments = vi.fn().mockResolvedValue(0);
    const collection = vi.fn().mockReturnValue({ findOne, countDocuments });
    const db = { collection } as unknown as Db;

    const poller = new CommandPoller({
      telegram,
      commandDeps: { db, paperMode: true, maxConcurrent: 3 },
      logger: fakeLogger(),
      pollTimeoutSeconds: 1,
    });

    const runPromise = poller.start();
    await vi.waitFor(() => expect(sendMessage).toHaveBeenCalledTimes(1));
    expect(sendMessage).toHaveBeenCalledWith("42", expect.stringContaining("Status"));

    poller.stop();
    await runPromise;
  });

  it("advances the offset past processed updates", async () => {
    const getUpdates = vi
      .fn()
      .mockResolvedValueOnce([{ update_id: 5, message: { text: "/status", chat: { id: 1 } } }])
      .mockImplementation(() => delayed([]));
    const telegram = {
      getUpdates,
      sendMessage: vi.fn().mockResolvedValue(undefined),
    } as unknown as TelegramClient;

    const collection = vi.fn().mockReturnValue({
      findOne: vi.fn().mockResolvedValue(null),
      countDocuments: vi.fn().mockResolvedValue(0),
    });
    const db = { collection } as unknown as Db;

    const poller = new CommandPoller({
      telegram,
      commandDeps: { db, paperMode: true, maxConcurrent: 3 },
      logger: fakeLogger(),
    });

    const runPromise = poller.start();
    await vi.waitFor(() => expect(getUpdates).toHaveBeenCalledWith(6, expect.any(Number)));

    poller.stop();
    await runPromise;
  });

  it("skips updates with no text or no chat id, without crashing", async () => {
    const getUpdates = vi
      .fn()
      .mockResolvedValueOnce([{ update_id: 1, message: { chat: { id: 1 } } }])
      .mockImplementation(() => delayed([]));
    const sendMessage = vi.fn().mockResolvedValue(undefined);
    const telegram = { getUpdates, sendMessage } as unknown as TelegramClient;
    const db = { collection: vi.fn() } as unknown as Db;

    const poller = new CommandPoller({
      telegram,
      commandDeps: { db, paperMode: true, maxConcurrent: 3 },
      logger: fakeLogger(),
    });

    const runPromise = poller.start();
    await vi.waitFor(() => expect(getUpdates).toHaveBeenCalled());
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(sendMessage).not.toHaveBeenCalled();

    poller.stop();
    await runPromise;
  });

  it("logs and backs off on an error instead of crashing the loop", async () => {
    const getUpdates = vi
      .fn()
      .mockRejectedValueOnce(new Error("network blip"))
      .mockImplementation(() => delayed([]));
    const telegram = {
      getUpdates,
      sendMessage: vi.fn().mockResolvedValue(undefined),
    } as unknown as TelegramClient;
    const db = { collection: vi.fn() } as unknown as Db;
    const logger = fakeLogger();

    const poller = new CommandPoller({
      telegram,
      commandDeps: { db, paperMode: true, maxConcurrent: 3 },
      logger,
      errorBackoffMs: 5,
    });

    const runPromise = poller.start();
    await vi.waitFor(() => expect(logger.error).toHaveBeenCalled());

    poller.stop();
    await runPromise;
  });
});
