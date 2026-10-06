/**
 * PostgreSQL client factory.
 * Creates a Pool configured from environment variables.
 * Status: Enterprise Candidate — Active Development
 */
import pg from "pg";

const { Pool } = pg;

export type DbPool = pg.Pool;
export type DbClient = pg.PoolClient;

/**
 * Create a connection pool.
 * All connection settings come from DATABASE_URL or individual PG* env vars.
 */
export function createPool(connectionString?: string): pg.Pool {
  return new Pool({
    connectionString: connectionString ?? process.env["DATABASE_URL"],
    // Use UTC for all timestamps
    options: "-c timezone=UTC",
    max: 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
  });
}

/**
 * Run a callback inside a transaction.
 * Rolls back automatically on error.
 */
export async function withTransaction<T>(
  pool: pg.Pool,
  fn: (client: pg.PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}
