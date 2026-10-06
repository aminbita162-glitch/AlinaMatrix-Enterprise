import { describe, it, expect } from "vitest";
import { createServer } from "node:http";
import type { Server } from "node:http";
import { router } from "../src/router.js";
import type { HealthResponse } from "../src/router.js";
import type { AuthDb, AuthSession } from "../src/auth.js";

// Minimal mock AuthDb for /auth/me tests.
function mockAuthDb(session: AuthSession | null): AuthDb {
  return {
    async findUserByEmail() { return null; },
    async findMembershipByUser() { return null; },
    async createSession() { },
    async findSession(id: string) {
      if (id === session?.sessionId) return session;
      return null;
    },
    async deleteSession() { },
    async recordAuditEvent() { },
  };
}

const VALID_SESSION: AuthSession = {
  sessionId:   "aaaaaaaa-0000-4000-8000-000000000001",
  userId:      "bbbbbbbb-0000-4000-8000-000000000002",
  tenantId:    "cccccccc-0000-4000-8000-000000000003",
  expiresAt:   new Date(Date.now() + 60_000),
};

function startWithAuth(session: AuthSession | null): Promise<{ server: Server; port: number }> {
  return new Promise((resolve, reject) => {
    const server = createServer(router({ authDb: mockAuthDb(session) }));
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      if (!addr || typeof addr === "string") { reject(new Error("Unexpected address")); return; }
      resolve({ server, port: addr.port });
    });
  });
}

// router() with no db — health works, auth routes return 503
function startTestServer(): Promise<{ server: Server; port: number }> {
  return new Promise((resolve, reject) => {
    const server = createServer(router());
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      if (!addr || typeof addr === "string") { reject(new Error("Unexpected address")); return; }
      resolve({ server, port: addr.port });
    });
  });
}

function stopServer(server: Server): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close((err) => (err ? reject(err) : resolve()));
  });
}

describe("GET /health", () => {
  it("returns 200 with correct JSON shape", async () => {
    const { server, port } = await startTestServer();
    try {
      const res = await fetch(`http://127.0.0.1:${port}/health`);
      expect(res.status).toBe(200);
      const body = (await res.json()) as HealthResponse;
      expect(body.status).toBe("ok");
      expect(body.version).toBe("1.0.0");
      expect(body.maturity).toBe("enterprise-candidate");
    } finally {
      await stopServer(server);
    }
  });

  it("returns 404 for unknown routes", async () => {
    const { server, port } = await startTestServer();
    try {
      const res = await fetch(`http://127.0.0.1:${port}/unknown`);
      expect(res.status).toBe(404);
    } finally {
      await stopServer(server);
    }
  });
});

describe("GET /auth/me", () => {
  it("returns 401 without a session cookie", async () => {
    const { server, port } = await startWithAuth(VALID_SESSION);
    try {
      const res = await fetch(`http://127.0.0.1:${port}/auth/me`);
      expect(res.status).toBe(401);
    } finally {
      await stopServer(server);
    }
  });

  it("returns 401 for an invalid session cookie", async () => {
    const { server, port } = await startWithAuth(VALID_SESSION);
    try {
      const res = await fetch(`http://127.0.0.1:${port}/auth/me`, {
        headers: { Cookie: "sid=not-a-real-session" },
      });
      expect(res.status).toBe(401);
    } finally {
      await stopServer(server);
    }
  });

  it("returns the session user id and tenant id for a valid session", async () => {
    const { server, port } = await startWithAuth(VALID_SESSION);
    try {
      const res = await fetch(`http://127.0.0.1:${port}/auth/me`, {
        headers: { Cookie: `sid=${VALID_SESSION.sessionId}` },
      });
      expect(res.status).toBe(200);
      const body = (await res.json()) as { userId: string; tenantId: string };
      expect(body.userId).toBe(VALID_SESSION.userId);
      expect(body.tenantId).toBe(VALID_SESSION.tenantId);
    } finally {
      await stopServer(server);
    }
  });

  it("returns 503 when no authDb is wired", async () => {
    const { server, port } = await startTestServer();
    try {
      const res = await fetch(`http://127.0.0.1:${port}/auth/me`, {
        headers: { Cookie: `sid=${VALID_SESSION.sessionId}` },
      });
      expect(res.status).toBe(503);
    } finally {
      await stopServer(server);
    }
  });
});
