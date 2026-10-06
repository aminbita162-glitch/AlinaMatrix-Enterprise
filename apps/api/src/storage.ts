/**
 * Local filesystem object storage driver.
 * Key format: {tenant_id}/{relative_path}
 * Path traversal is rejected.
 *
 * Status: Enterprise Candidate — Active Development
 */
import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, stat, unlink } from "node:fs/promises";
import { join, normalize, sep } from "node:path";
import type { Readable } from "node:stream";

export class PathTraversalError extends Error {
  constructor(key: string) {
    super(`Path traversal rejected for key: ${key}`);
    this.name = "PathTraversalError";
  }
}

export class StorageKeyError extends Error {
  constructor(reason: string) {
    super(`Invalid storage key: ${reason}`);
    this.name = "StorageKeyError";
  }
}

/**
 * Validate that a storage key is safe and return the resolved absolute path.
 * A key has the form `{tenant_id}/{relative_path}`.
 * Any `..` segment or attempt to escape the base directory is rejected.
 */
function resolveKey(baseDir: string, tenantId: string, relativePath: string): string {
  // Validate tenant_id format
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(tenantId)) {
    throw new StorageKeyError("tenant_id is not a valid UUID");
  }
  // Reject path traversal in relativePath
  if (relativePath.includes("..")) {
    throw new PathTraversalError(`${tenantId}/${relativePath}`);
  }
  // Normalise and verify the resolved path stays inside the tenant directory
  const tenantDir = join(baseDir, tenantId);
  const resolved = normalize(join(tenantDir, relativePath));
  // normalize can collapse slashes; verify prefix
  if (!resolved.startsWith(tenantDir + sep) && resolved !== tenantDir) {
    throw new PathTraversalError(`${tenantId}/${relativePath}`);
  }
  return resolved;
}

export interface ObjectStorage {
  put(tenantId: string, relativePath: string, data: Buffer): Promise<void>;
  get(tenantId: string, relativePath: string): Promise<Readable>;
  exists(tenantId: string, relativePath: string): Promise<boolean>;
  delete(tenantId: string, relativePath: string): Promise<void>;
}

export function createLocalStorage(baseDir: string): ObjectStorage {
  return {
    async put(tenantId, relativePath, data) {
      const dest = resolveKey(baseDir, tenantId, relativePath);
      await mkdir(join(dest, ".."), { recursive: true });
      await new Promise<void>((resolve, reject) => {
        const ws = createWriteStream(dest);
        ws.on("finish", resolve);
        ws.on("error", reject);
        ws.end(data);
      });
    },

    async get(tenantId, relativePath) {
      const src = resolveKey(baseDir, tenantId, relativePath);
      return createReadStream(src);
    },

    async exists(tenantId, relativePath) {
      // resolveKey throws PathTraversalError / StorageKeyError — let those propagate
      const p = resolveKey(baseDir, tenantId, relativePath);
      try {
        await stat(p);
        return true;
      } catch {
        return false;
      }
    },

    async delete(tenantId, relativePath) {
      const p = resolveKey(baseDir, tenantId, relativePath);
      await unlink(p);
    },
  };
}
