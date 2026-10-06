/**
 * Tenant context: sets and clears app.current_tenant_id for the current transaction.
 * The tenant_id is derived server-side from the session/membership — never from client input.
 *
 * Status: Enterprise Candidate — Active Development
 */
import type pg from "pg";

/**
 * Set `app.current_tenant_id` for the duration of the current transaction.
 * Must be called AFTER BEGIN and BEFORE any tenant-scoped query.
 *
 * Directive R08: tenant_id is server-derived; never passed from client directly.
 */
export async function setTenantContext(
  client: pg.PoolClient,
  tenantId: string,
): Promise<void> {
  // Validate: must be a valid UUID string to prevent injection
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(tenantId)) {
    throw new Error("Invalid tenant_id format");
  }
  await client.query("SELECT set_config('app.current_tenant_id', $1, true)", [tenantId]);
}

/**
 * Clear `app.current_tenant_id` for the current transaction.
 * After this call, RLS will return no rows (fail closed).
 */
export async function clearTenantContext(client: pg.PoolClient): Promise<void> {
  await client.query("SELECT set_config('app.current_tenant_id', '', true)");
}

/**
 * Run a callback with a transaction-local tenant context.
 * The tenant_id is set only for the duration of the transaction.
 */
export async function withTenantContext<T>(
  client: pg.PoolClient,
  tenantId: string,
  fn: (client: pg.PoolClient) => Promise<T>,
): Promise<T> {
  await setTenantContext(client, tenantId);
  try {
    return await fn(client);
  } finally {
    await clearTenantContext(client);
  }
}
