import { createServer, type Server } from "node:http";
import type { Logger } from "pino";

export function createHealthServer(port: number, logger: Logger): Server {
  const server = createServer((req, res) => {
    if (req.url === "/health" && req.method === "GET") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ status: "ok", service: "notifier" }));
      return;
    }
    res.writeHead(404, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: "not found" }));
  });

  server.listen(port, () => {
    logger.info({ port }, "health server listening");
  });

  return server;
}
