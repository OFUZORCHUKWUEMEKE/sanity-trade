import { afterEach, describe, expect, it, vi } from "vitest";
import { TelegramClient } from "./telegram-client.js";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("TelegramClient.sendMessage", () => {
  it("posts to the sendMessage endpoint with the chat id and text", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, text: async () => "" });
    vi.stubGlobal("fetch", fetchMock);

    const client = new TelegramClient("token123");
    await client.sendMessage("chat1", "hello");

    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.telegram.org/bottoken123/sendMessage",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ chat_id: "chat1", text: "hello", parse_mode: "Markdown" }),
      }),
    );
  });

  it("throws with the response body on a non-ok response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 400, text: async () => "bad request" }),
    );
    const client = new TelegramClient("token123");
    await expect(client.sendMessage("chat1", "hello")).rejects.toThrow("bad request");
  });
});

describe("TelegramClient.getUpdates", () => {
  it("requests with offset and timeout, returning the result array", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true, result: [{ update_id: 5 }] }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const client = new TelegramClient("token123");
    const updates = await client.getUpdates(5, 30);

    expect(updates).toEqual([{ update_id: 5 }]);
    const calledUrl = fetchMock.mock.calls[0]![0] as URL;
    expect(calledUrl.toString()).toContain("offset=5");
    expect(calledUrl.toString()).toContain("timeout=30");
  });

  it("returns an empty array when result is absent", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true }) }),
    );
    const client = new TelegramClient("token123");
    expect(await client.getUpdates(0, 30)).toEqual([]);
  });

  it("throws on a non-ok response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 500, text: async () => "server error" }),
    );
    const client = new TelegramClient("token123");
    await expect(client.getUpdates(0, 30)).rejects.toThrow("server error");
  });
});
