/**
 * Tenant context and RLS isolation tests.
 * Tests the pure TypeScript logic: UUID validation, tenant context guard.
 * No live database required.
 *
 * Status: Enterprise Candidate — Active Development
 */
import { describe, it, expect } from "vitest";
import { setTenantContext, clearTenantContext } from "../src/tenant-context.js";

// ----------------------------------------------------------------
// Mock PoolClient
// ----------------------------------------------------------------
interface MockQuery {
  text: string;
  values: unknown[];
}

function makeMockClient(): { client: Parameters<typeof setTenantContext>[0]; queries: MockQuery[] } {
  const queries: MockQuery[] = [];
  const client = {
    query: async (text: string, values?: unknown[]) => {
      queries.push({ text, values: values ?? [] });
      return { rows: [], rowCount: 0 };
    },
  } as unknown as Parameters<typeof setTenantContext>[0];
  return { client, queries };
}

// ----------------------------------------------------------------
// setTenantContext
// ----------------------------------------------------------------
describe("setTenantContext", () => {
  it("calls SET LOCAL with a valid UUID", async () => {
    const { client, queries } = makeMockClient();
    await setTenantContext(client, "aaaaaaaa-0000-4000-a000-000000000001");
    expect(queries).toHaveLength(1);
    const q = queries[0];
    expect(q?.text).toContain("set_config");
    expect(q?.text).toContain("app.current_tenant_id");
    expect(q?.values?.[0]).toBe("aaaaaaaa-0000-4000-a000-000000000001");
  });

  it("rejects a non-UUID tenant_id", async () => {
    const { client } = makeMockClient();
    await expect(setTenantContext(client, "not-a-uuid")).rejects.toThrow("Invalid tenant_id format");
  });

  it("rejects empty string as tenant_id", async () => {
    const { client } = makeMockClient();
    await expect(setTenantContext(client, "")).rejects.toThrow("Invalid tenant_id format");
  });

  it("rejects client-supplied tenant_id containing SQL injection attempt", async () => {
    const { client } = makeMockClient();
    // Injection attempt: not a UUID format, so rejected before reaching DB
    await expect(
      setTenantContext(client, "'; DROP TABLE tenants; --"),
    ).rejects.toThrow("Invalid tenant_id format");
  });

  it("does not accept path-like strings as tenant_id", async () => {
    const { client } = makeMockClient();
    await expect(setTenantContext(client, "../other-tenant")).rejects.toThrow(
      "Invalid tenant_id format",
    );
  });
});

// ----------------------------------------------------------------
// clearTenantContext
// ----------------------------------------------------------------
describe("clearTenantContext", () => {
  it("calls set_config with empty string to clear tenant context", async () => {
    const { client, queries } = makeMockClient();
    await clearTenantContext(client);
    expect(queries).toHaveLength(1);
    const q = queries[0];
    expect(q?.text).toContain("set_config");
    expect(q?.text).toContain("app.current_tenant_id");
    // Empty string causes RLS to return no rows (fail closed)
    expect(q?.text).toContain("''");
  });
});

// ----------------------------------------------------------------
// Tenant isolation contract
// ----------------------------------------------------------------
describe("Tenant isolation contract", () => {
  it("two separate set_config calls produce two distinct tenant contexts", async () => {
    const { client: clientA, queries: queriesA } = makeMockClient();
    const { client: clientB, queries: queriesB } = makeMockClient();

    await setTenantContext(clientA, "aaaaaaaa-0000-4000-a000-000000000001");
    await setTenantContext(clientB, "bbbbbbbb-0000-4000-b000-000000000002");

    expect(queriesA[0]?.values?.[0]).toBe("aaaaaaaa-0000-4000-a000-000000000001");
    expect(queriesB[0]?.values?.[0]).toBe("bbbbbbbb-0000-4000-b000-000000000002");
    // The two clients did not share state
    expect(queriesA[0]?.values?.[0]).not.toBe(queriesB[0]?.values?.[0]);
  });

  it("after clearTenantContext the query sets tenant to empty (fail-closed)", async () => {
    const { client, queries } = makeMockClient();
    await setTenantContext(client, "aaaaaaaa-0000-4000-a000-000000000001");
    await clearTenantContext(client);
    // Second query clears the tenant; RLS will return no rows
    expect(queries[1]?.text).toContain("''");
  });
});
