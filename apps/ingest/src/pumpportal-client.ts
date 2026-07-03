import { EventEmitter } from "node:events";
import WebSocket from "ws";
import type { Logger } from "pino";
import type { SubscriptionCommand } from "./subscription-manager.js";

export interface PumpPortalClientOptions {
  url: string;
  logger: Logger;
  heartbeatTimeoutMs: number;
  reconnectBaseDelayMs: number;
  reconnectMaxDelayMs: number;
  watchedWallets: () => string[];
  resubscribeTrackedMints: () => SubscriptionCommand | undefined;
  heartbeatCheckIntervalMs?: number;
}

/**
 * Wraps the PumpPortal WebSocket feed: connects, subscribes to new-token and
 * watched-wallet trade events, force-reconnects on a silent connection
 * (no message within heartbeatTimeoutMs), and reconnects with exponential
 * backoff on close/error, fully resubscribing (including any per-mint trade
 * subscriptions) every time.
 */
export class PumpPortalClient extends EventEmitter {
  private ws: WebSocket | undefined;
  private closing = false;
  private reconnectAttempt = 0;
  private lastMessageAt = 0;
  private heartbeatTimer: NodeJS.Timeout | undefined;
  private reconnectTimer: NodeJS.Timeout | undefined;

  constructor(private readonly opts: PumpPortalClientOptions) {
    super();
  }

  start(): void {
    this.closing = false;
    this.connect();
  }

  stop(): void {
    this.closing = true;
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.ws?.close();
  }

  send(command: SubscriptionCommand | { method: string; keys?: string[] }): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(command));
    } else {
      this.opts.logger.warn({ command }, "dropped subscription command: socket not open");
    }
  }

  private connect(): void {
    const { url, logger } = this.opts;
    logger.info({ url, attempt: this.reconnectAttempt }, "connecting to PumpPortal");
    const ws = new WebSocket(url);
    this.ws = ws;

    ws.on("open", () => {
      logger.info("PumpPortal connection open");
      this.reconnectAttempt = 0;
      this.lastMessageAt = Date.now();
      this.subscribeAll();
      this.startHeartbeatCheck();
      this.emit("open");
    });

    ws.on("message", (data) => {
      this.lastMessageAt = Date.now();
      let parsed: unknown;
      try {
        parsed = JSON.parse(data.toString());
      } catch {
        logger.warn({ data: data.toString() }, "received non-JSON message");
        return;
      }
      this.emit("message", parsed);
    });

    ws.on("close", (code, reason) => {
      logger.warn({ code, reason: reason.toString() }, "PumpPortal connection closed");
      this.stopHeartbeatCheck();
      this.emit("close");
      this.scheduleReconnect();
    });

    ws.on("error", (err) => {
      logger.error({ err }, "PumpPortal connection error");
      this.emit("error", err);
    });
  }

  private subscribeAll(): void {
    this.send({ method: "subscribeNewToken" });

    const wallets = this.opts.watchedWallets();
    if (wallets.length > 0) {
      this.send({ method: "subscribeAccountTrade", keys: wallets });
    }

    const resubscribe = this.opts.resubscribeTrackedMints();
    if (resubscribe) {
      this.send(resubscribe);
    }
  }

  private startHeartbeatCheck(): void {
    const intervalMs = this.opts.heartbeatCheckIntervalMs ?? 5_000;
    this.heartbeatTimer = setInterval(() => {
      const silentFor = Date.now() - this.lastMessageAt;
      if (silentFor > this.opts.heartbeatTimeoutMs) {
        this.opts.logger.warn({ silentFor }, "heartbeat timeout, forcing reconnect");
        this.ws?.terminate();
      }
    }, intervalMs);
  }

  private stopHeartbeatCheck(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = undefined;
    }
  }

  private scheduleReconnect(): void {
    if (this.closing) return;
    const { reconnectBaseDelayMs, reconnectMaxDelayMs } = this.opts;
    const delay = Math.min(reconnectBaseDelayMs * 2 ** this.reconnectAttempt, reconnectMaxDelayMs);
    this.reconnectAttempt += 1;
    this.opts.logger.info({ delay, attempt: this.reconnectAttempt }, "scheduling reconnect");
    this.reconnectTimer = setTimeout(() => this.connect(), delay);
  }
}
