import { normalizedEventSchema, type NormalizedEvent } from "@memebot/core";
import type { Redis } from "ioredis";
import type { Logger } from "pino";

export class StreamConsumer {
  private running = false;
  private lastId = "$";

  constructor(
    private readonly redis: Redis,
    private readonly streamKey: string,
    private readonly onEvent: (event: NormalizedEvent) => void,
    private readonly logger: Logger,
    private readonly blockMs = 5_000,
  ) {}

  async start(): Promise<void> {
    this.running = true;
    while (this.running) {
      let result: [string, [string, string[]][]][] | null;
      try {
        result = await this.redis.xread(
          "BLOCK",
          this.blockMs,
          "STREAMS",
          this.streamKey,
          this.lastId,
        );
      } catch (err) {
        this.logger.error({ err }, "stream read failed, retrying");
        continue;
      }
      if (!result) continue;

      for (const [, entries] of result) {
        for (const [id, fields] of entries) {
          this.lastId = id;
          this.processEntry(id, fields);
        }
      }
    }
  }

  stop(): void {
    this.running = false;
  }

  private processEntry(id: string, fields: string[]): void {
    const eventIndex = fields.indexOf("event");
    const payload = eventIndex >= 0 ? fields[eventIndex + 1] : undefined;
    if (!payload) {
      this.logger.warn({ id }, "stream entry missing event field");
      return;
    }

    try {
      const parsed: unknown = JSON.parse(payload);
      const event = normalizedEventSchema.parse(parsed);
      this.onEvent(event);
    } catch (err) {
      this.logger.warn({ err, id }, "failed to parse stream event");
    }
  }
}
