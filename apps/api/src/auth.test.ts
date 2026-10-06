/**
 * Authentication unit tests.
 * Uses a mock AuthDb — no live database required.
 * Tests: cookie flags, login success/failure, logout, tenant isolation.
 *
 * Status: Enterprise Candidate — Active Development
 */
import { describe, it, expect, vi } from "vitest";
import {
  buildSessionCookie,
  buildClearCookie,
  parseSessionCookie,
  login,
  logout,
  resolveSession,
  SESSION_COOKIE,
} from "../src/auth.js";
import type { AuthDb, AuthUser, AuthMembership, AuthSession } from "../src/auth.js";
import { hash as argon2Hash } from "@node-rs/argon2";
import { createServer } from "node:http";
import type { Server } from "node:http";
import { router } from "../src/router.js";

// ----------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------
function makeDb(overrides: Partial<AuthDb> = {}): AuthDb {
  return {
    findUserByEmail: vi.fn().mockResolvedValue(null),
    findMembershipByUser: vi.fn().mockResolvedValue(null),
    createSession: vi.fn().mockResolvedValue(undefined),
    findSession: vi.fn().mockResolvedValue(null),
    deleteSession: vi.fn().mockResolvedValue(undefined),
    recordAuditEvent: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

function startTestServer(db?: AuthDb): Promise<{ server: Server; port: number }> {
  return new Promise((resolve, reject) => {
    const server = createServer(router(db));
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      if (!addr || typeof addr === "string") {
        reject(new Error("Unexpected address"));
        return;
      }
      resolve({ server, port: addr.port });
    });
  });
}

function stopServer(server: Server): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close((err) => (err ? reject(err) : resolve()));
  });
}

// ----------------------------------------------------------------
// Cookie helpers
// ----------------------------------------------------------------
describe("Cookie helpers", () => {
  it("buildSessionCookie includes HttpOnly, Secure, SameSite=Lax", () => {
    const expires = new Date(Date.now() + 3600_000);
    const cookie = buildSessionCookie("test-session-id", expires);
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("Secure");
    expect(cookie).toContain("SameSite=Lax");
    expect(cookie).toContain(`${SESSION_COOKIE}=test-session-id`);
  });

  it("buildSessionCookie includes an Expires field", () => {
    const expires = new Date(Date.now() + 3600_000);
    const cookie = buildSessionCookie("session-abc", expires);
    expect(cookie).toMatch(/Expires=/);
  });

  it("buildClearCookie sets cookie to empty and past expiry", () => {
    const cookie = buildClearCookie();
    expect(cookie).toContain(`${SESSION_COOKIE}=`);
    expect(cookie).toContain("1970");
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("Secure");
    expect(cookie).toContain("SameSite=Lax");
  });

  it("parseSessionCookie extracts the session id", () => {
    const id = parseSessionCookie(`${SESSION_COOKIE}=my-id; other=val`);
    expect(id).toBe("my-id");
  });

  it("parseSessionCookie returns null when cookie absent", () => {
    expect(parseSessionCookie(undefined)).toBeNull();
    expect(parseSessionCookie("")).toBeNull();
    expect(parseSessionCookie("other=val")).toBeNull();
  });
});

// ----------------------------------------------------------------
// login()
// ----------------------------------------------------------------
describe("login()", () => {
  it("returns null for unknown email", async () => {
    const db = makeDb({ findUserByEmail: vi.fn().mockResolvedValue(null) });
    const result = await login(db, "nobody@example.com", "password");
    expect(result).toBeNull();
  });

  it("returns null for wrong password", async () => {
    const hash = await argon2Hash("correct-password");
    const user: AuthUser = {
      userId: "uid-1",
      email: "user@example.com",
      passwordHash: hash,
    };
    const db = makeDb({ findUserByEmail: vi.fn().mockResolvedValue(user) });
    const result = await login(db, "user@example.com", "wrong-password");
    expect(result).toBeNull();
  });

  it("returns null when user has no tenant membership", async () => {
    const hash = await argon2Hash("password123");
    const user: AuthUser = {
      userId: "uid-2",
      email: "orphan@example.com",
      passwordHash: hash,
    };
    const db = makeDb({
      findUserByEmail: vi.fn().mockResolvedValue(user),
      findMembershipByUser: vi.fn().mockResolvedValue(null),
    });
    const result = await login(db, "orphan@example.com", "password123");
    expect(result).toBeNull();
  });

  it("returns session with correct tenantId on valid credentials", async () => {
    const hash = await argon2Hash("password-ok");
    const user: AuthUser = {
      userId: "uid-3",
      email: "valid@example.com",
      passwordHash: hash,
    };
    const membership: AuthMembership = { tenantId: "tenant-id-xyz" };
    const db = makeDb({
      findUserByEmail: vi.fn().mockResolvedValue(user),
      findMembershipByUser: vi.fn().mockResolvedValue(membership),
    });
    const result = await login(db, "valid@example.com", "password-ok");
    expect(result).not.toBeNull();
    expect(result?.tenantId).toBe("tenant-id-xyz");
    expect(result?.userId).toBe("uid-3");
    expect(result?.email).toBe("valid@example.com");
  });

  it("session cookie has correct flags after successful login", async () => {
    const hash = await argon2Hash("pass-for-cookie");
    const user: AuthUser = {
      userId: "uid-4",
      email: "cookie@example.com",
      passwordHash: hash,
    };
    const membership: AuthMembership = { tenantId: "tenant-cookie" };
    const db = makeDb({
      findUserByEmail: vi.fn().mockResolvedValue(user),
      findMembershipByUser: vi.fn().mockResolvedValue(membership),
    });
    const result = await login(db, "cookie@example.com", "pass-for-cookie");
    expect(result?.sessionCookie).toContain("HttpOnly");
    expect(result?.sessionCookie).toContain("Secure");
    expect(result?.sessionCookie).toContain("SameSite=Lax");
  });

  it("records an audit event on successful login", async () => {
    const hash = await argon2Hash("audit-pass");
    const user: AuthUser = {
      userId: "uid-5",
      email: "audit@example.com",
      passwordHash: hash,
    };
    const membership: AuthMembership = { tenantId: "tenant-audit" };
    const auditFn = vi.fn().mockResolvedValue(undefined);
    const db = makeDb({
      findUserByEmail: vi.fn().mockResolvedValue(user),
      findMembershipByUser: vi.fn().mockResolvedValue(membership),
      recordAuditEvent: auditFn,
    });
    await login(db, "audit@example.com", "audit-pass");
    expect(auditFn).toHaveBeenCalledWith(
      "tenant-audit",
      "uid-5",
      "auth.login",
      "session",
      expect.any(String),
    );
  });
});

// ----------------------------------------------------------------
// logout()
// ----------------------------------------------------------------
describe("logout()", () => {
  it("calls deleteSession with the session id from cookie", async () => {
    const deleteFn = vi.fn().mockResolvedValue(undefined);
    const db = makeDb({ deleteSession: deleteFn });
    await logout(db, `${SESSION_COOKIE}=my-session-id`);
    expect(deleteFn).toHaveBeenCalledWith("my-session-id");
  });

  it("does not throw when no cookie is present", async () => {
    const db = makeDb();
    await expect(logout(db, undefined)).resolves.toBeUndefined();
  });
});

// ----------------------------------------------------------------
// resolveSession()
// ----------------------------------------------------------------
describe("resolveSession()", () => {
  it("returns null when no cookie header", async () => {
    const db = makeDb();
    const result = await resolveSession(db, undefined);
    expect(result).toBeNull();
  });

  it("returns null when session is not found in db", async () => {
    const db = makeDb({ findSession: vi.fn().mockResolvedValue(null) });
    const result = await resolveSession(db, `${SESSION_COOKIE}=unknown-id`);
    expect(result).toBeNull();
  });

  it("returns the session when found", async () => {
    const session: AuthSession = {
      sessionId: "found-id",
      userId: "u1",
      tenantId: "t1",
      expiresAt: new Date(Date.now() + 3600_000),
    };
    const db = makeDb({ findSession: vi.fn().mockResolvedValue(session) });
    const result = await resolveSession(db, `${SESSION_COOKIE}=found-id`);
    expect(result?.sessionId).toBe("found-id");
    expect(result?.tenantId).toBe("t1");
  });
});

// ----------------------------------------------------------------
// HTTP: POST /auth/login — integration via router
// ----------------------------------------------------------------
describe("POST /auth/login (HTTP)", () => {
  it("returns 401 for invalid credentials", async () => {
    const db = makeDb({ findUserByEmail: vi.fn().mockResolvedValue(null) });
    const { server, port } = await startTestServer(db);
    try {
      const res = await fetch(`http://127.0.0.1:${port}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "nobody@test.com", password: "wrong" }),
      });
      expect(res.status).toBe(401);
    } finally {
      await stopServer(server);
    }
  });

  it("returns 400 for malformed JSON", async () => {
    const db = makeDb();
    const { server, port } = await startTestServer(db);
    try {
      const res = await fetch(`http://127.0.0.1:${port}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "not-json",
      });
      expect(res.status).toBe(400);
    } finally {
      await stopServer(server);
    }
  });

  it("returns 400 for missing email field", async () => {
    const db = makeDb();
    const { server, port } = await startTestServer(db);
    try {
      const res = await fetch(`http://127.0.0.1:${port}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: "pass" }),
      });
      expect(res.status).toBe(400);
    } finally {
      await stopServer(server);
    }
  });

  it("returns Set-Cookie with HttpOnly, Secure, SameSite=Lax on successful login", async () => {
    const hash = await argon2Hash("http-pass");
    const user: AuthUser = {
      userId: "http-uid",
      email: "http@test.com",
      passwordHash: hash,
    };
    const membership: AuthMembership = { tenantId: "http-tenant" };
    const db = makeDb({
      findUserByEmail: vi.fn().mockResolvedValue(user),
      findMembershipByUser: vi.fn().mockResolvedValue(membership),
    });
    const { server, port } = await startTestServer(db);
    try {
      const res = await fetch(`http://127.0.0.1:${port}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "http@test.com", password: "http-pass" }),
      });
      expect(res.status).toBe(200);
      const setCookie = res.headers.get("set-cookie") ?? "";
      expect(setCookie).toContain("HttpOnly");
      expect(setCookie).toContain("Secure");
      expect(setCookie).toContain("SameSite=Lax");
    } finally {
      await stopServer(server);
    }
  });

  it("returns 503 when router has no db injected", async () => {
    const { server, port } = await startTestServer(undefined);
    try {
      const res = await fetch(`http://127.0.0.1:${port}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "a@b.com", password: "pw" }),
      });
      expect(res.status).toBe(503);
    } finally {
      await stopServer(server);
    }
  });
});

// ----------------------------------------------------------------
// HTTP: POST /auth/logout
// ----------------------------------------------------------------
describe("POST /auth/logout (HTTP)", () => {
  it("returns 204 and clears cookie", async () => {
    const db = makeDb();
    const { server, port } = await startTestServer(db);
    try {
      const res = await fetch(`http://127.0.0.1:${port}/auth/logout`, {
        method: "POST",
      });
      expect(res.status).toBe(204);
      const setCookie = res.headers.get("set-cookie") ?? "";
      expect(setCookie).toContain("1970");
    } finally {
      await stopServer(server);
    }
  });
});
