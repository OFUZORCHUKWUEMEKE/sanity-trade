import type { Logger } from "pino";
import type { CommandDeps } from "./commands.js";
import { handleCommand } from "./commands.js";
import type { TelegramClient } from "./telegram-client.js";

export interface CommandPollerOptions {
  telegram: TelegramClient;
  commandDeps: CommandDeps;
  logger: Logger;
  pollTimeoutSeconds?: number;
  errorBackoffMs?: number;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Long-polls Telegram's getUpdates for incoming commands, replying in the
 * same chat. Mirrors the reconnect-on-error pattern used by the ingest
 * WebSocket client and the engine's stream consumer. */
export class CommandPoller {
  private running = false;
  private offset = 0;

  constructor(private readonly opts: CommandPollerOptions) {}

  async start(): Promise<void> {
    this.running = true;
    while (this.running) {
      try {
        const updates = await this.opts.telegram.getUpdates(
          this.offset,
          this.opts.pollTimeoutSeconds ?? 30,
        );
        for (const update of updates) {
          this.offset = update.update_id + 1;
          const text = update.message?.text;
          const chatId = update.message?.chat.id;
          if (!text || chatId === undefined) continue;

          const reply = await handleCommand(this.opts.commandDeps, text);
          await this.opts.telegram.sendMessage(String(chatId), reply);
        }
      } catch (err) {
        this.opts.logger.error({ err }, "command poller iteration failed, retrying");
        await sleep(this.opts.errorBackoffMs ?? 3_000);
      }
    }
  }

  stop(): void {
    this.running = false;
  }
}
