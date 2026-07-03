export interface TelegramUpdate {
  update_id: number;
  message?: {
    text?: string;
    chat: { id: number };
  };
}

/** Minimal Telegram Bot API client: send messages and long-poll for
 * updates. Deliberately avoids a full bot framework dependency - Phase 1
 * only needs sendMessage and getUpdates. */
export class TelegramClient {
  constructor(
    private readonly token: string,
    private readonly baseUrl = "https://api.telegram.org",
  ) {}

  async sendMessage(chatId: string, text: string): Promise<void> {
    const response = await fetch(`${this.baseUrl}/bot${this.token}/sendMessage`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: "Markdown" }),
    });
    if (!response.ok) {
      throw new Error(`Telegram sendMessage failed: ${response.status} ${await response.text()}`);
    }
  }

  async getUpdates(offset: number, timeoutSeconds: number): Promise<TelegramUpdate[]> {
    const url = new URL(`${this.baseUrl}/bot${this.token}/getUpdates`);
    url.searchParams.set("offset", String(offset));
    url.searchParams.set("timeout", String(timeoutSeconds));

    const response = await fetch(url, { method: "GET" });
    if (!response.ok) {
      throw new Error(`Telegram getUpdates failed: ${response.status} ${await response.text()}`);
    }
    const body = (await response.json()) as { ok: boolean; result?: TelegramUpdate[] };
    return body.result ?? [];
  }
}
