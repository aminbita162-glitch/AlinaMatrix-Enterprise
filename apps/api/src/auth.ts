/**
 * Authentication: login, logout, session resolution.
 * argon2id password verification. HttpOnly, Secure, SameSite=Lax cookie.
 *
 * Directive R08: tenant context is server-derived from membership; never from client input.
 * Directive R09: password hashes are never logged.
 *
 * Status: Enterprise Candidate — Active Development
 */
import { verify as argon2Verify } from "@node-rs/argon2";
import { v4 as uuidv4 } from "uuid";
import type pg from "pg";
import { logger } from "./logger.js";

export const SESSION_COOKIE = "sid";

// Session lifetime: 8 hours
const SESSION_TTL_MS = 8 * 60 * 60 * 1000;

// ----------------------------------------------------------------
// Types
// ----------------------------------------------------------------
export interface AuthUser {
  userId: string;
  email: string;
  passwordHash: string;
}

export interface AuthMembership {
  tenantId: string;
}

export interface AuthSession {
  sessionId: string;
  userId: string;
  tenantId: string;
  expiresAt: Date;
}

// ----------------------------------------------------------------
// Database operations (thin wrappers; testable via mock)
// ----------------------------------------------------------------
export interface AuthDb {
  findUserByEmail(email: string): Promise<AuthUser | null>;
  findMembershipByUser(userId: string): Promise<AuthMembership | null>;
  createSession(session: AuthSession): Promise<void>;
  findSession(sessionId: string): Promise<AuthSession | null>;
  deleteSession(sessionId: string): Promise<void>;
  recordAuditEvent(
    tenantId: string,
    userId: string | null,
    action: string,
    resource: string,
    resourceId?: string,
  ): Promise<void>;
}

export function createPgAuthDb(client: pg.PoolClient): AuthDb {
  return {
    async findUserByEmail(email) {
      const result = await client.query<{
        id: string;
        email: string;
        password_hash: string;
      }>("SELECT id, email, password_hash FROM users WHERE email = $1", [email]);
      const row = result.rows[0];
      if (!row) return null;
      return { userId: row.id, email: row.email, passwordHash: row.password_hash };
    },

    async findMembershipByUser(userId) {
      const result = await client.query<{ tenant_id: string }>(
        "SELECT tenant_id FROM memberships WHERE user_id = $1 LIMIT 1",
        [userId],
      );
      const row = result.rows[0];
      if (!row) return null;
      return { tenantId: row.tenant_id };
    },

    async createSession(session) {
      await client.query(
        `INSERT INTO sessions (id, user_id, tenant_id, expires_at) VALUES ($1, $2, $3, $4)`,
        [session.sessionId, session.userId, session.tenantId, session.expiresAt],
      );
    },

    async findSession(sessionId) {
      const result = await client.query<{
        id: string;
        user_id: string;
        tenant_id: string;
        expires_at: Date;
      }>(
        "SELECT id, user_id, tenant_id, expires_at FROM sessions WHERE id = $1 AND expires_at > now()",
        [sessionId],
      );
      const row = result.rows[0];
      if (!row) return null;
      return {
        sessionId: row.id,
        userId: row.user_id,
        tenantId: row.tenant_id,
        expiresAt: row.expires_at,
      };
    },

    async deleteSession(sessionId) {
      await client.query("DELETE FROM sessions WHERE id = $1", [sessionId]);
    },

    async recordAuditEvent(tenantId, userId, action, resource, resourceId) {
      await client.query(
        `INSERT INTO audit_events (tenant_id, user_id, action, resource, resource_id)
         VALUES ($1, $2, $3, $4, $5)`,
        [tenantId, userId, action, resource, resourceId ?? null],
      );
    },
  };
}

// ----------------------------------------------------------------
// Cookie serialisation
// ----------------------------------------------------------------

/**
 * Build a Set-Cookie header value for the session cookie.
 * Flags: HttpOnly, Secure, SameSite=Lax.
 */
export function buildSessionCookie(sessionId: string, expiresAt: Date): string {
  return [
    `${SESSION_COOKIE}=${sessionId}`,
    `Expires=${expiresAt.toUTCString()}`,
    "Path=/",
    "HttpOnly",
    "Secure",
    "SameSite=Lax",
  ].join("; ");
}

/**
 * Build a Set-Cookie header value that clears the session cookie.
 */
export function buildClearCookie(): string {
  return [
    `${SESSION_COOKIE}=`,
    "Expires=Thu, 01 Jan 1970 00:00:00 GMT",
    "Path=/",
    "HttpOnly",
    "Secure",
    "SameSite=Lax",
  ].join("; ");
}

/**
 * Parse the session ID from a Cookie header value.
 * Returns null if the cookie is absent.
 */
export function parseSessionCookie(cookieHeader: string | undefined): string | null {
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(";")) {
    const [name, value] = part.trim().split("=", 2);
    if (name?.trim() === SESSION_COOKIE && value) {
      return value.trim();
    }
  }
  return null;
}

// ----------------------------------------------------------------
// Core auth operations
// ----------------------------------------------------------------

export interface LoginResult {
  sessionCookie: string;
  userId: string;
  tenantId: string;
  email: string;
}

/**
 * Validate credentials and create a session.
 * Returns null on invalid credentials (timing-safe: always runs argon2 verify).
 */
export async function login(
  db: AuthDb,
  email: string,
  password: string,
): Promise<LoginResult | null> {
  const user = await db.findUserByEmail(email);

  // Always run argon2 verify to prevent timing-based user enumeration.
  // If no user, verify against a dummy hash (still runs the full computation).
  const DUMMY_HASH =
    "$argon2id$v=19$m=65536,t=3,p=4$c29tZXNhbHQ$RdescudvJCsgt3ub+b+dWRWJTmaaJObG";
  const hashToVerify = user?.passwordHash ?? DUMMY_HASH;

  let valid = false;
  try {
    valid = await argon2Verify(hashToVerify, password);
  } catch (err) {
    logger.error("argon2 verify failed", { error: (err as Error).message });
    return null;
  }

  if (!valid || !user) return null;

  const membership = await db.findMembershipByUser(user.userId);
  if (!membership) {
    logger.warn("login: user has no tenant membership", { userId: user.userId });
    return null;
  }

  const sessionId = uuidv4();
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  const session: AuthSession = {
    sessionId,
    userId: user.userId,
    tenantId: membership.tenantId,
    expiresAt,
  };

  await db.createSession(session);
  await db.recordAuditEvent(membership.tenantId, user.userId, "auth.login", "session", sessionId);

  return {
    sessionCookie: buildSessionCookie(sessionId, expiresAt),
    userId: user.userId,
    tenantId: membership.tenantId,
    email: user.email,
  };
}

/**
 * Resolve a session from the Cookie header.
 * Returns null if the session is absent or expired.
 */
export async function resolveSession(
  db: AuthDb,
  cookieHeader: string | undefined,
): Promise<AuthSession | null> {
  const sessionId = parseSessionCookie(cookieHeader);
  if (!sessionId) return null;
  return db.findSession(sessionId);
}

/**
 * Destroy a session (logout).
 */
export async function logout(db: AuthDb, cookieHeader: string | undefined): Promise<void> {
  const sessionId = parseSessionCookie(cookieHeader);
  if (sessionId) {
    await db.deleteSession(sessionId);
  }
}
