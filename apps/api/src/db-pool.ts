/**
 * Pool-based DB helper: acquire a client, begin a transaction, optionally set
 * tenant context, run the operation, commit, and release.
 *
 * Each call acquires its own client from the pool and releases it when done.
 * Tenant context is transaction-scoped (set_config is_local=true), so it is
 * cleared automatically when the transaction commits or rolls back.
 *
 * Operations that do not yet know the tenant_id (e.g. findUserByEmail,
 * findSession) pass null — the connection on Render bypasses RLS as the
 * database owner; in CI the unit tests use mock Db interfaces instead.
 *
 * Status: Enterprise Candidate — Active Development
 */
import type pg from "pg";
import { setTenantContext } from "@alinamatrix/db";

export async function withPoolClient<T>(
  pool: pg.Pool,
  tenantId: string | null,
  fn: (client: pg.PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    if (tenantId !== null) {
      await setTenantContext(client, tenantId);
    }
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    try {
      await client.query("ROLLBACK");
    } catch {
      // Ignore rollback errors — the original error is more important
    }
    throw err;
  } finally {
    client.release();
  }
}
