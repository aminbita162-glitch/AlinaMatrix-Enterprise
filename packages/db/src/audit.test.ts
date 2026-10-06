/**
 * Audit events policy tests.
 * Verifies that the migration SQL does not create UPDATE or DELETE policies
 * for audit_events, enforcing append-only semantics at the RLS layer.
 *
 * Status: Enterprise Candidate — Active Development
 */
import { describe, it, expect } from "vitest";
import { readFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATION_PATH = join(
  __dirname,
  "../migrations/001_identity_tenancy_rls.sql",
);

describe("audit_events RLS policy (migration SQL)", () => {
  it("creates a SELECT policy for audit_events", async () => {
    const sql = await readFile(MIGRATION_PATH, "utf8");
    expect(sql).toMatch(/CREATE POLICY[^;]+ON audit_events\s*\n\s*FOR SELECT/);
  });

  it("creates an INSERT policy for audit_events", async () => {
    const sql = await readFile(MIGRATION_PATH, "utf8");
    expect(sql).toMatch(/CREATE POLICY[^;]+ON audit_events\s*\n\s*FOR INSERT/);
  });

  it("does NOT create an UPDATE policy for audit_events", async () => {
    const sql = await readFile(MIGRATION_PATH, "utf8");
    // No UPDATE policy block for audit_events
    expect(sql).not.toMatch(/CREATE POLICY[^;]+ON audit_events\s*\n\s*FOR UPDATE/);
  });

  it("does NOT create a DELETE policy for audit_events", async () => {
    const sql = await readFile(MIGRATION_PATH, "utf8");
    expect(sql).not.toMatch(/CREATE POLICY[^;]+ON audit_events\s*\n\s*FOR DELETE/);
  });

  it("enables FORCE ROW LEVEL SECURITY on audit_events", async () => {
    const sql = await readFile(MIGRATION_PATH, "utf8");
    expect(sql).toMatch(/FORCE ROW LEVEL SECURITY[\s\S]*?audit_events/);
  });
});
