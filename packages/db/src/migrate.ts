/**
 * Forward-only migration runner.
 * Applies unapplied SQL migration files in lexicographic order.
 *
 * Status: Enterprise Candidate — Active Development
 */
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import type pg from "pg";

export async function runMigrations(pool: pg.Pool, migrationsDir: string): Promise<void> {
  // Ensure the migration registry exists (idempotent bootstrap)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id         serial      PRIMARY KEY,
      name       text        NOT NULL UNIQUE,
      applied_at timestamptz NOT NULL DEFAULT now()
    )
  `);

  const applied = await pool.query<{ name: string }>(
    "SELECT name FROM schema_migrations ORDER BY id ASC",
  );
  const appliedNames = new Set(applied.rows.map((r) => r.name));

  const files = (await readdir(migrationsDir))
    .filter((f) => f.endsWith(".sql"))
    .sort();

  for (const file of files) {
    const name = file.replace(/\.sql$/, "");
    if (appliedNames.has(name)) continue;

    const sql = await readFile(join(migrationsDir, file), "utf8");
    await pool.query(sql);

    // If the SQL file itself did not insert into schema_migrations, record it now
    const check = await pool.query<{ name: string }>(
      "SELECT name FROM schema_migrations WHERE name = $1",
      [name],
    );
    if (check.rowCount === 0) {
      await pool.query("INSERT INTO schema_migrations (name) VALUES ($1)", [name]);
    }
  }
}
