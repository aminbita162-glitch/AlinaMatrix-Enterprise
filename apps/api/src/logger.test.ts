/**
 * Logger redaction tests.
 * Verifies that secret-shaped strings are redacted before output.
 *
 * Status: Enterprise Candidate — Active Development
 */
import { describe, it, expect } from "vitest";
import { redact } from "../src/logger.js";

describe("redact()", () => {
  it("redacts an argon2id hash", () => {
    const hash =
      "$argon2id$v=19$m=65536,t=3,p=4$c29tZXNhbHQ$RdescudvJCsgt3ub+b+dWRWJTmaaJObG";
    const out = redact(`user hash is ${hash}`);
    expect(out).not.toContain("$argon2id$");
    expect(out).toContain("[REDACTED]");
  });

  it("redacts a Bearer token", () => {
    const out = redact("Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.payload.sig");
    expect(out).not.toContain("eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9");
    expect(out).toContain("[REDACTED]");
  });

  it("redacts a 40+ hex string (e.g. SHA-256 digest)", () => {
    const hex = "a".repeat(64);
    const out = redact(`digest: ${hex}`);
    expect(out).not.toContain(hex);
    expect(out).toContain("[REDACTED]");
  });

  it("does not redact short non-secret strings", () => {
    const out = redact("status: ok, version: 1.0.0");
    expect(out).toBe("status: ok, version: 1.0.0");
    expect(out).not.toContain("[REDACTED]");
  });

  it("handles non-string input by serialising then redacting", () => {
    const hash =
      "$argon2id$v=19$m=65536,t=3,p=4$c29tZXNhbHQ$RdescudvJCsgt3ub+b+dWRWJTmaaJObG";
    const out = redact({ user: "alice", passwordHash: hash });
    expect(out).not.toContain("$argon2id$");
    expect(out).toContain("[REDACTED]");
  });
});
