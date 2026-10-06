/**
 * HTTP router for apps/api.
 * Routes: GET /health, POST /auth/login, POST /auth/logout
 *
 * Status: Enterprise Candidate — Active Development
 */
import type { IncomingMessage, ServerResponse } from "node:http";
import { LoginRequestSchema } from "@alinamatrix/contracts";
import { login, logout, buildClearCookie } from "./auth.js";
import { logger } from "./logger.js";
import type { AuthDb } from "./auth.js";

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

async function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

async function handleLogin(
  req: IncomingMessage,
  res: ServerResponse,
  db: AuthDb,
): Promise<void> {
  let body: unknown;
  try {
    body = JSON.parse(await readBody(req));
  } catch {
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Invalid JSON" }));
    return;
  }

  const parsed = LoginRequestSchema.safeParse(body);
  if (!parsed.success) {
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Invalid request" }));
    return;
  }

  const { email, password } = parsed.data;
  const result = await login(db, email, password);
  if (!result) {
    // Use a generic message to prevent user enumeration
    res.writeHead(401, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Invalid credentials" }));
    return;
  }

  res.writeHead(200, {
    "Content-Type": "application/json",
    "Set-Cookie": result.sessionCookie,
  });
  res.end(
    JSON.stringify({
      userId: result.userId,
      tenantId: result.tenantId,
      email: result.email,
    }),
  );
}

async function handleLogout(
  req: IncomingMessage,
  res: ServerResponse,
  db: AuthDb,
): Promise<void> {
  await logout(db, req.headers["cookie"]);
  res.writeHead(204, { "Set-Cookie": buildClearCookie() });
  res.end();
}

/**
 * Router factory. Accepts an optional AuthDb for dependency injection in tests.
 * When no db is provided (health-only mode), auth routes return 503.
 */
export function router(db?: AuthDb) {
  return function route(req: IncomingMessage, res: ServerResponse): void {
    const url = req.url ?? "/";
    const method = req.method ?? "GET";

    if (method === "GET" && url === "/health") {
      handleHealth(req, res);
      return;
    }

    if (method === "POST" && url === "/auth/login") {
      if (!db) {
        res.writeHead(503, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Service unavailable" }));
        return;
      }
      handleLogin(req, res, db).catch((err: unknown) => {
        logger.error("login handler error", { error: (err as Error).message });
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Internal server error" }));
      });
      return;
    }

    if (method === "POST" && url === "/auth/logout") {
      if (!db) {
        res.writeHead(503, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Service unavailable" }));
        return;
      }
      handleLogout(req, res, db).catch((err: unknown) => {
        logger.error("logout handler error", { error: (err as Error).message });
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Internal server error" }));
      });
      return;
    }

    handleNotFound(req, res);
  };
}
