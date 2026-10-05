import type { IncomingMessage, ServerResponse } from "node:http";

export interface HealthResponse {
  status: "ok";
  version: string;
  maturity: "enterprise-candidate";
}

function handleHealth(_req: IncomingMessage, res: ServerResponse): void {
  const body: HealthResponse = {
    status: "ok",
    version: "1.0.0",
    maturity: "enterprise-candidate",
  };
  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}

function handleNotFound(_req: IncomingMessage, res: ServerResponse): void {
  res.writeHead(404, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ error: "Not Found" }));
}

export function router(req: IncomingMessage, res: ServerResponse): void {
  if (req.method === "GET" && req.url === "/health") {
    handleHealth(req, res);
    return;
  }
  handleNotFound(req, res);
}
