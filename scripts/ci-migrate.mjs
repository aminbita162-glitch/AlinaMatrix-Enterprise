/**
 * CI migration runner.
 * Connects as SUPERUSER_URL, applies all migrations, then grants
 * ALL TABLES to app_user (covers tables from migrations 001-002
 * which predate the per-migration GRANT pattern).
 *
 * Usage:
 *   SUPERUSER_URL=postgres://... node scripts/ci-migrate.mjs
 *
 * AlinaMatrix Enterprise — Enterprise Candidate — Active Development
 */

import { createRequire } from "node:module";
import { readdir, readFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Resolve pg from the db package, which has it as a direct dependency
const require = createRequire(join(__dirname, "../packages/db/package.json"));
const pg = require("pg");
const { Pool } = pg;

const migrationsDir = join(__dirname, "../packages/db/migrations");
const seedFile = join(__dirname, "../packages/db/seed/fixture.sql");

const connectionString = process.env["SUPERUSER_URL"];
if (!connectionString) {
  console.error("SUPERUSER_URL is required");
  process.exit(1);
}

const pool = new Pool({ connectionString });

async function run() {
  // Bootstrap migration registry
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id         serial      PRIMARY KEY,
      name       text        NOT NULL UNIQUE,
      applied_at timestamptz NOT NULL DEFAULT now()
    )
  `);

  const applied = await pool.query("SELECT name FROM schema_migrations ORDER BY id ASC");
  const appliedNames = new Set(applied.rows.map((r) => r.name));

  const files = (await readdir(migrationsDir))
    .filter((f) => f.endsWith(".sql"))
    .sort();

  for (const file of files) {
    const name = file.replace(/\.sql$/, "");
    if (appliedNames.has(name)) {
      console.log(`  skip  ${file}`);
      continue;
    }
    console.log(`  apply ${file}`);
    const sql = await readFile(join(migrationsDir, file), "utf8");
    await pool.query(sql);
    const check = await pool.query("SELECT name FROM schema_migrations WHERE name = $1", [name]);
    if (check.rowCount === 0) {
      await pool.query("INSERT INTO schema_migrations (name) VALUES ($1)", [name]);
    }
  }

  // Grant all tables to app_user (idempotent; covers tables from migrations
  // 001-002 which predate the per-migration GRANT pattern added in 003+)
  await pool.query("GRANT ALL ON ALL TABLES IN SCHEMA public TO app_user");
  await pool.query("GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO app_user");
  console.log("  grant ALL TABLES / SEQUENCES -> app_user");

  // Load fixture seed
  console.log("  seed  fixture.sql");
  const seed = await readFile(seedFile, "utf8");
  await pool.query(seed);

  await pool.end();
  console.log("Migration + seed complete.");
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
