/**
 * HTTP router for apps/api.
 * Routes: GET /health, POST /auth/login, POST /auth/logout,
 *         POST /sources/upload, GET /sources/:id
 *
 * Status: Enterprise Candidate — Active Development
 */
import type { IncomingMessage, ServerResponse } from "node:http";
import { LoginRequestSchema, UploadSourceRequestSchema } from "@alinamatrix/contracts";
import { login, logout, buildClearCookie, resolveSession } from "./auth.js";
import { ingestSource, IngestValidationError } from "./ingest.js";
import { logger } from "./logger.js";
import type { AuthDb } from "./auth.js";
import type { IngestDb } from "./ingest.js";
import type { ObjectStorage } from "./storage.js";

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

async function readBodyBinary(req: IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks)));
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

// ============================================================
// Source upload
// ============================================================

/**
 * Parse a multipart/form-data body.
 * Returns a map of field names to their Buffer values plus the file buffer.
 * This is a minimal parser for the specific shape of the upload endpoint:
 *   fields: projectId, name, mimeType, idempotencyKey
 *   file field: file
 */
async function parseMultipart(
  req: IncomingMessage,
): Promise<{ fields: Record<string, string>; fileBuffer: Buffer; fileName: string } | null> {
  const contentType = req.headers["content-type"] ?? "";
  const boundaryMatch = /boundary=([^\s;]+)/.exec(contentType);
  if (!boundaryMatch) return null;

  const boundary = "--" + boundaryMatch[1];
  const bodyBuf = await readBodyBinary(req);

  const parts: Array<{ headers: string; body: Buffer }> = [];
  let pos = 0;
  const boundaryBuf = Buffer.from(boundary, "utf8");

  while (pos < bodyBuf.length) {
    const boundaryStart = indexOfBuf(bodyBuf, boundaryBuf, pos);
    if (boundaryStart === -1) break;
    pos = boundaryStart + boundaryBuf.length;

    // Skip \r\n after boundary
    if (bodyBuf[pos] === 0x0d && bodyBuf[pos + 1] === 0x0a) pos += 2;
    else if (bodyBuf[pos] === 0x2d && bodyBuf[pos + 1] === 0x2d) break; // --boundary--

    // Find end of headers (\r\n\r\n)
    const headerEnd = indexOfBuf(bodyBuf, Buffer.from("\r\n\r\n"), pos);
    if (headerEnd === -1) break;

    const headers = bodyBuf.subarray(pos, headerEnd).toString("utf8");
    pos = headerEnd + 4;

    const nextBoundary = indexOfBuf(bodyBuf, boundaryBuf, pos);
    if (nextBoundary === -1) break;

    // Body ends just before \r\n--boundary
    const bodyEnd = nextBoundary - 2; // subtract \r\n
    const body = bodyBuf.subarray(pos, bodyEnd);

    parts.push({ headers, body });
    pos = nextBoundary;
  }

  const fields: Record<string, string> = {};
  let fileBuffer: Buffer | null = null;
  let fileName = "";

  for (const part of parts) {
    const nameMatch = /name="([^"]+)"/.exec(part.headers);
    if (!nameMatch) continue;
    const fieldName = nameMatch[1]!;

    const fileNameMatch = /filename="([^"]*)"/.exec(part.headers);
    if (fileNameMatch) {
      fileBuffer = part.body;
      fileName = fileNameMatch[1] ?? "";
    } else {
      fields[fieldName] = part.body.toString("utf8");
    }
  }

  if (!fileBuffer) return null;
  return { fields, fileBuffer, fileName };
}

function indexOfBuf(haystack: Buffer, needle: Buffer, start = 0): number {
  for (let i = start; i <= haystack.length - needle.length; i++) {
    let match = true;
    for (let j = 0; j < needle.length; j++) {
      if (haystack[i + j] !== needle[j]) { match = false; break; }
    }
    if (match) return i;
  }
  return -1;
}

async function handleUpload(
  req: IncomingMessage,
  res: ServerResponse,
  authDb: AuthDb,
  ingestDb: IngestDb,
  storage: ObjectStorage,
): Promise<void> {
  // Resolve session
  const session = await resolveSession(authDb, req.headers["cookie"]);
  if (!session) {
    res.writeHead(401, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Unauthorized" }));
    return;
  }

  const parsed = await parseMultipart(req);
  if (!parsed) {
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Expected multipart/form-data with file field" }));
    return;
  }

  const { fields, fileBuffer } = parsed;

  const bodyParsed = UploadSourceRequestSchema.safeParse({
    projectId:      fields["projectId"],
    name:           fields["name"],
    mimeType:       fields["mimeType"],
    idempotencyKey: fields["idempotencyKey"],
  });

  if (!bodyParsed.success) {
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Invalid upload fields", detail: bodyParsed.error.flatten() }));
    return;
  }

  const { projectId, name, mimeType, idempotencyKey } = bodyParsed.data;

  try {
    const result = await ingestSource(ingestDb, storage, {
      tenantId:  session.tenantId,
      userId:    session.userId,
      projectId,
      name,
      mimeType,
      idempotencyKey,
      fileBytes: fileBuffer,
    });

    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(result));
  } catch (err: unknown) {
    if (err instanceof IngestValidationError) {
      res.writeHead(422, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: err.message, code: err.code }));
      return;
    }
    logger.error("upload handler error", { error: (err as Error).message });
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Internal server error" }));
  }
}

// ============================================================
// Router factory
// ============================================================

export interface RouterDeps {
  authDb?:   AuthDb;
  ingestDb?: IngestDb;
  storage?:  ObjectStorage;
}

/**
 * Router factory. Accepts optional dependencies for injection in tests.
 * When a dependency is absent, the corresponding routes return 503.
 */
export function router(deps: RouterDeps | AuthDb = {}) {
  // Back-compat: if a plain AuthDb is passed (Phase 1/2 test style), wrap it
  const resolved: RouterDeps =
    deps && "findUserByEmail" in deps
      ? { authDb: deps as AuthDb }
      : (deps as RouterDeps);

  const { authDb, ingestDb, storage } = resolved;

  return function route(req: IncomingMessage, res: ServerResponse): void {
    const url = req.url ?? "/";
    const method = req.method ?? "GET";

    if (method === "GET" && url === "/health") {
      handleHealth(req, res);
      return;
    }

    if (method === "POST" && url === "/auth/login") {
      if (!authDb) {
        res.writeHead(503, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Service unavailable" }));
        return;
      }
      handleLogin(req, res, authDb).catch((err: unknown) => {
        logger.error("login handler error", { error: (err as Error).message });
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Internal server error" }));
      });
      return;
    }

    if (method === "POST" && url === "/auth/logout") {
      if (!authDb) {
        res.writeHead(503, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Service unavailable" }));
        return;
      }
      handleLogout(req, res, authDb).catch((err: unknown) => {
        logger.error("logout handler error", { error: (err as Error).message });
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Internal server error" }));
      });
      return;
    }

    if (method === "POST" && url === "/sources/upload") {
      if (!authDb || !ingestDb || !storage) {
        res.writeHead(503, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Service unavailable" }));
        return;
      }
      handleUpload(req, res, authDb, ingestDb, storage).catch((err: unknown) => {
        logger.error("upload handler error", { error: (err as Error).message });
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Internal server error" }));
      });
      return;
    }

    handleNotFound(req, res);
  };
}
