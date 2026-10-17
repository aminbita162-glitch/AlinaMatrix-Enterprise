/**
 * API server entry point.
 *
 * R2 — Render Deploy:
 *   - Reads DATABASE_URL from the environment (Render env var).
 *   - Runs migrations before serving traffic.
 *   - Injects pool-based AuthDb, IngestDb, ReviewDb into the router.
 *   - Auth routes no longer return 503 once the database is connected.
 *   - Local storage is used for object storage (Render disk or ephemeral).
 *
 * Status: Enterprise Candidate — Active Development
 */
import { createServer } from "node:http";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { router } from "./router.js";
import { createPool } from "@alinamatrix/db";
import { runMigrations } from "@alinamatrix/db";
import { createPoolAuthDb } from "./auth.js";
import { createPoolIngestDb } from "./ingest.js";
import { createPoolReviewDb } from "./review.js";
import { createLocalStorage } from "./storage.js";
import { logger } from "./logger.js";
import type { DbPool } from "@alinamatrix/db";

const __dirname = dirname(fileURLToPath(import.meta.url));

const PORT = process.env["PORT"] ?? "3001";
const DATABASE_URL = process.env["DATABASE_URL"];
const STORAGE_DIR = process.env["STORAGE_DIR"] ?? join(__dirname, "..", "storage");

const pool: DbPool = createPool(DATABASE_URL);
const migrationsDir = join(__dirname, "..", "..", "packages", "db", "migrations");

async function startServer(): Promise<void> {
  // Run migrations before serving traffic.
  if (DATABASE_URL) {
    try {
      logger.info("Running database migrations before serve", {
        migrationsDir,
      });
      await runMigrations(pool, migrationsDir);
      logger.info("Database migrations complete");
    } catch (err) {
      logger.error("Database migration failed — cannot start server", {
        error: (err as Error).message,
      });
      pool.end();
      process.exit(1);
    }
  } else {
    logger.warn("DATABASE_URL not set — running without DB; routes will return 503");
  }

  const authDb = createPoolAuthDb(pool);
  const ingestDb = createPoolIngestDb(pool);
  const reviewDb = createPoolReviewDb(pool);
  const storage = createLocalStorage(STORAGE_DIR);

  const server = createServer(router({ authDb, ingestDb, storage, reviewDb }));

  server.listen(Number(PORT), () => {
    logger.info(`AlinaMatrix API listening on port ${PORT}`);
  });
}

startServer().catch((err) => {
  logger.error("Failed to start server", { error: (err as Error).message });
  pool.end();
  process.exit(1);
});
