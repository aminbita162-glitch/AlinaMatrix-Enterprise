/**
 * Storage driver tests — path traversal rejection, key validation.
 * No database required. Pure filesystem / logic tests.
 *
 * Status: Enterprise Candidate — Active Development
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createLocalStorage, PathTraversalError, StorageKeyError } from "../src/storage.js";

const VALID_TENANT_A = "aaaaaaaa-0000-4000-a000-000000000001";
const VALID_TENANT_B = "bbbbbbbb-0000-4000-b000-000000000002";

let baseDir: string;

beforeEach(async () => {
  baseDir = await mkdtemp(join(tmpdir(), "alinamatrix-storage-test-"));
});

afterEach(async () => {
  await rm(baseDir, { recursive: true, force: true });
});

describe("Object storage — path traversal rejection", () => {
  it("rejects path traversal with '..' in relativePath on put", async () => {
    const storage = createLocalStorage(baseDir);
    await expect(
      storage.put(VALID_TENANT_A, "../escape/file.txt", Buffer.from("data")),
    ).rejects.toThrow(PathTraversalError);
  });

  it("rejects path traversal with embedded '..' on put", async () => {
    const storage = createLocalStorage(baseDir);
    await expect(
      storage.put(VALID_TENANT_A, "subdir/../../escape.txt", Buffer.from("data")),
    ).rejects.toThrow(PathTraversalError);
  });

  it("rejects path traversal on get", async () => {
    const storage = createLocalStorage(baseDir);
    await expect(
      storage.get(VALID_TENANT_A, "../../etc/passwd"),
    ).rejects.toThrow(PathTraversalError);
  });

  it("rejects path traversal on exists", async () => {
    const storage = createLocalStorage(baseDir);
    await expect(
      storage.exists(VALID_TENANT_A, "../other-tenant/secret.txt"),
    ).rejects.toThrow(PathTraversalError);
  });

  it("rejects path traversal on delete", async () => {
    const storage = createLocalStorage(baseDir);
    await expect(
      storage.delete(VALID_TENANT_A, "../outside.txt"),
    ).rejects.toThrow(PathTraversalError);
  });

  it("rejects invalid tenant_id (not a UUID)", async () => {
    const storage = createLocalStorage(baseDir);
    await expect(
      storage.put("../evil", "file.txt", Buffer.from("data")),
    ).rejects.toThrow(StorageKeyError);
  });

  it("rejects tenant_id that is not a UUID format", async () => {
    const storage = createLocalStorage(baseDir);
    await expect(
      storage.put("not-a-uuid", "file.txt", Buffer.from("data")),
    ).rejects.toThrow(StorageKeyError);
  });
});

describe("Object storage — basic operations", () => {
  it("put and exists return true for a stored file", async () => {
    const storage = createLocalStorage(baseDir);
    await storage.put(VALID_TENANT_A, "docs/test.txt", Buffer.from("hello"));
    const found = await storage.exists(VALID_TENANT_A, "docs/test.txt");
    expect(found).toBe(true);
  });

  it("exists returns false for a missing file", async () => {
    const storage = createLocalStorage(baseDir);
    const found = await storage.exists(VALID_TENANT_A, "nonexistent.txt");
    expect(found).toBe(false);
  });

  it("tenant A file is not visible under tenant B path", async () => {
    const storage = createLocalStorage(baseDir);
    await storage.put(VALID_TENANT_A, "secret.txt", Buffer.from("tenant A secret"));
    // Tenant B does not have the same relative path under their prefix
    const found = await storage.exists(VALID_TENANT_B, "secret.txt");
    expect(found).toBe(false);
  });

  it("get returns readable stream with stored content", async () => {
    const storage = createLocalStorage(baseDir);
    const content = Buffer.from("readable content");
    await storage.put(VALID_TENANT_A, "read-me.txt", content);
    const stream = await storage.get(VALID_TENANT_A, "read-me.txt");
    const chunks: Buffer[] = [];
    await new Promise<void>((resolve, reject) => {
      stream.on("data", (c: Buffer) => chunks.push(c));
      stream.on("end", resolve);
      stream.on("error", reject);
    });
    expect(Buffer.concat(chunks).toString()).toBe("readable content");
  });
});
