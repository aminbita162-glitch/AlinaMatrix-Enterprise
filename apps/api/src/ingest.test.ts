/**
 * Unit tests for apps/api/src/ingest.ts
 * Covers: MIME validation, size cap, idempotency, audit events, extraction failure.
 * No live database or filesystem required — uses test doubles.
 *
 * Status: Enterprise Candidate — Active Development
 */
import { describe, it, expect, vi } from "vitest";
import { ingestSource, IngestValidationError } from "../src/ingest.js";
import type { IngestDb } from "../src/ingest.js";
import type { ObjectStorage } from "../src/storage.js";
import type { SourceRow, SourceVersionRow, SourceFragmentRow } from "@alinamatrix/db";
import { MAX_UPLOAD_BYTES } from "@alinamatrix/domain";

// ============================================================
// Fixture data
// ============================================================

const TENANT_A = "aaaaaaaa-0000-4000-a000-000000000001";
const USER_A   = "aaaaaaaa-0000-4000-a000-000000000101";
const PROJECT  = "cccccccc-0000-4000-c000-000000000001";
const SOURCE_ID  = "dddddddd-0000-4000-d000-000000000001";
const VERSION_ID = "eeeeeeee-0000-4000-e000-000000000001";

function makeSourceRow(): SourceRow {
  return {
    id:         SOURCE_ID,
    tenant_id:  TENANT_A,
    project_id: PROJECT,
    name:       "test.txt",
    mime_type:  "text/plain",
    created_at: new Date(),
    updated_at: new Date(),
  };
}

function makeVersionRow(status: "INGESTED" | "EXTRACTED" | "FAILED_TERMINAL" = "INGESTED"): SourceVersionRow {
  return {
    id:               VERSION_ID,
    source_id:        SOURCE_ID,
    tenant_id:        TENANT_A,
    sha256:           "a".repeat(64),
    size_bytes:       "100",
    storage_path:     `${SOURCE_ID}/${"a".repeat(64)}`,
    idempotency_key:  "idem-001",
    status,
    fail_reason:      null,
    created_at:       new Date(),
  };
}

function makeFragmentRow(): SourceFragmentRow {
  return {
    id:         "ff000000-0000-4000-f000-000000000001",
    version_id: VERSION_ID,
    tenant_id:  TENANT_A,
    ordinal:    0,
    page:       null,
    text:       "Hello world",
    char_start: 0,
    char_end:   11,
    hash:       "h".repeat(64),
    created_at: new Date(),
  };
}

// ============================================================
// Test doubles
// ============================================================

function makeIngestDb(overrides: Partial<IngestDb> = {}): IngestDb {
  return {
    insertSource: vi.fn().mockResolvedValue(makeSourceRow()),
    upsertSourceVersion: vi.fn().mockResolvedValue({
      row: makeVersionRow(),
      deduplicated: false,
    }),
    setVersionStatus: vi.fn().mockResolvedValue(undefined),
    insertSourceFragments: vi.fn().mockResolvedValue([makeFragmentRow()]),
    recordAuditEvent: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

function makeStorage(): ObjectStorage {
  return {
    put:    vi.fn().mockResolvedValue(undefined),
    get:    vi.fn().mockResolvedValue(null),
    exists: vi.fn().mockResolvedValue(false),
    delete: vi.fn().mockResolvedValue(undefined),
  };
}

// A minimal valid plain-text file buffer
const VALID_TXT_BYTES = Buffer.from(
  "This is the first paragraph.\n\nThis is the second paragraph.",
  "utf8",
);

// ============================================================
// MIME validation
// ============================================================

describe("MIME validation", () => {
  it("rejects a disallowed MIME type with IngestValidationError MIME_MISMATCH", async () => {
    const db = makeIngestDb();
    const storage = makeStorage();

    await expect(
      ingestSource(db, storage, {
        tenantId:       TENANT_A,
        userId:         USER_A,
        projectId:      PROJECT,
        name:           "evil.exe",
        mimeType:       "application/x-msdownload",
        idempotencyKey: "idem-001",
        fileBytes:      Buffer.from("MZ\x90\x00"),
      }),
    ).rejects.toThrow(IngestValidationError);
  });

  it("rejects a PDF whose magic bytes do not start with %PDF", async () => {
    const db = makeIngestDb();
    const storage = makeStorage();
    // Claim it is a PDF but supply plain-text bytes
    await expect(
      ingestSource(db, storage, {
        tenantId:       TENANT_A,
        userId:         USER_A,
        projectId:      PROJECT,
        name:           "fake.pdf",
        mimeType:       "application/pdf",
        idempotencyKey: "idem-002",
        fileBytes:      Buffer.from("this is not a pdf"),
      }),
    ).rejects.toThrow(IngestValidationError);
  });

  it("error code is MIME_MISMATCH for MIME rejection", async () => {
    const db = makeIngestDb();
    const storage = makeStorage();

    let caught: IngestValidationError | null = null;
    try {
      await ingestSource(db, storage, {
        tenantId:       TENANT_A,
        userId:         USER_A,
        projectId:      PROJECT,
        name:           "fake.pdf",
        mimeType:       "application/pdf",
        idempotencyKey: "idem-003",
        fileBytes:      Buffer.from("not a pdf"),
      });
    } catch (err) {
      if (err instanceof IngestValidationError) caught = err;
    }

    expect(caught).not.toBeNull();
    expect(caught?.code).toBe("MIME_MISMATCH");
  });

  it("accepts a valid plain-text upload", async () => {
    const db = makeIngestDb();
    const storage = makeStorage();

    const result = await ingestSource(db, storage, {
      tenantId:       TENANT_A,
      userId:         USER_A,
      projectId:      PROJECT,
      name:           "doc.txt",
      mimeType:       "text/plain",
      idempotencyKey: "idem-txt",
      fileBytes:      VALID_TXT_BYTES,
    });

    expect(result.status).toBe("EXTRACTED");
    expect(result.deduplicated).toBe(false);
  });
});

// ============================================================
// Size cap
// ============================================================

describe("File size cap", () => {
  it("rejects files larger than MAX_UPLOAD_BYTES", async () => {
    const db = makeIngestDb();
    const storage = makeStorage();

    const oversized = Buffer.alloc(MAX_UPLOAD_BYTES + 1, 0x41); // 'A' * (50MB + 1)

    await expect(
      ingestSource(db, storage, {
        tenantId:       TENANT_A,
        userId:         USER_A,
        projectId:      PROJECT,
        name:           "huge.txt",
        mimeType:       "text/plain",
        idempotencyKey: "idem-big",
        fileBytes:      oversized,
      }),
    ).rejects.toThrow(IngestValidationError);
  });

  it("error code is FILE_TOO_LARGE for size rejection", async () => {
    const db = makeIngestDb();
    const storage = makeStorage();
    const oversized = Buffer.alloc(MAX_UPLOAD_BYTES + 1, 0x41);

    let caught: IngestValidationError | null = null;
    try {
      await ingestSource(db, storage, {
        tenantId:       TENANT_A,
        userId:         USER_A,
        projectId:      PROJECT,
        name:           "huge.txt",
        mimeType:       "text/plain",
        idempotencyKey: "idem-big2",
        fileBytes:      oversized,
      });
    } catch (err) {
      if (err instanceof IngestValidationError) caught = err;
    }

    expect(caught?.code).toBe("FILE_TOO_LARGE");
  });

  it("does not call DB or storage when file is too large", async () => {
    const db = makeIngestDb();
    const storage = makeStorage();
    const oversized = Buffer.alloc(MAX_UPLOAD_BYTES + 1, 0x41);

    try {
      await ingestSource(db, storage, {
        tenantId: TENANT_A, userId: USER_A, projectId: PROJECT,
        name: "huge.txt", mimeType: "text/plain",
        idempotencyKey: "idem-big3", fileBytes: oversized,
      });
    } catch { /* expected */ }

    expect(db.insertSource).not.toHaveBeenCalled();
    expect((storage.put as ReturnType<typeof vi.fn>)).not.toHaveBeenCalled();
  });
});

// ============================================================
// Idempotency
// ============================================================

describe("Idempotency key deduplication", () => {
  it("returns existing version without creating new DB rows when key matches", async () => {
    const db = makeIngestDb({
      upsertSourceVersion: vi.fn().mockResolvedValue({
        row: makeVersionRow("EXTRACTED"),
        deduplicated: true,
      }),
    });
    const storage = makeStorage();

    const result = await ingestSource(db, storage, {
      tenantId:       TENANT_A,
      userId:         USER_A,
      projectId:      PROJECT,
      name:           "doc.txt",
      mimeType:       "text/plain",
      idempotencyKey: "idem-001",
      fileBytes:      VALID_TXT_BYTES,
    });

    expect(result.deduplicated).toBe(true);
    expect(result.versionId).toBe(VERSION_ID);
    expect(result.status).toBe("EXTRACTED");
  });

  it("does not store bytes when idempotency key deduplicates", async () => {
    const db = makeIngestDb({
      upsertSourceVersion: vi.fn().mockResolvedValue({
        row: makeVersionRow("EXTRACTED"),
        deduplicated: true,
      }),
    });
    const storage = makeStorage();

    await ingestSource(db, storage, {
      tenantId: TENANT_A, userId: USER_A, projectId: PROJECT,
      name: "doc.txt", mimeType: "text/plain",
      idempotencyKey: "idem-001", fileBytes: VALID_TXT_BYTES,
    });

    expect((storage.put as ReturnType<typeof vi.fn>)).not.toHaveBeenCalled();
  });

  it("does not write audit event for a deduplicated upload", async () => {
    const db = makeIngestDb({
      upsertSourceVersion: vi.fn().mockResolvedValue({
        row: makeVersionRow("EXTRACTED"),
        deduplicated: true,
      }),
    });
    const storage = makeStorage();

    await ingestSource(db, storage, {
      tenantId: TENANT_A, userId: USER_A, projectId: PROJECT,
      name: "doc.txt", mimeType: "text/plain",
      idempotencyKey: "idem-001", fileBytes: VALID_TXT_BYTES,
    });

    // No audit event should be written (upload was deduplicated before any DB write)
    const auditCalls = (db.recordAuditEvent as ReturnType<typeof vi.fn>).mock.calls;
    expect(auditCalls.filter((c: unknown[]) => (c[2] as string).includes("upload"))).toHaveLength(0);
  });
});

// ============================================================
// Audit events
// ============================================================

describe("Audit events", () => {
  it("writes a source.upload audit event on successful upload", async () => {
    const db = makeIngestDb();
    const storage = makeStorage();

    await ingestSource(db, storage, {
      tenantId:       TENANT_A,
      userId:         USER_A,
      projectId:      PROJECT,
      name:           "doc.txt",
      mimeType:       "text/plain",
      idempotencyKey: "idem-audit",
      fileBytes:      VALID_TXT_BYTES,
    });

    const auditCalls = (db.recordAuditEvent as ReturnType<typeof vi.fn>).mock.calls as unknown[][];
    const uploadEvent = auditCalls.find((c) => c[2] === "source.upload");
    expect(uploadEvent).toBeDefined();
    expect(uploadEvent?.[0]).toBe(TENANT_A);
    expect(uploadEvent?.[1]).toBe(USER_A);
  });

  it("writes a source.extraction_failed audit event when extraction fails", async () => {
    // Simulate DOCX extraction failure: supply a non-DOCX byte sequence as DOCX
    // We need the DOCX magic bytes (PK\x03\x04) but with invalid ZIP content
    const brokenDocx = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x00, 0x00, 0x00, 0x00]);

    const db = makeIngestDb({
      setVersionStatus: vi.fn().mockResolvedValue(undefined),
    });
    const storage = makeStorage();

    const result = await ingestSource(db, storage, {
      tenantId:       TENANT_A,
      userId:         USER_A,
      projectId:      PROJECT,
      name:           "broken.docx",
      mimeType:       "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      idempotencyKey: "idem-fail",
      fileBytes:      brokenDocx,
    });

    expect(result.status).toBe("FAILED_TERMINAL");
    expect(result.failReason).toBeDefined();
    expect(result.failReason!.length).toBeGreaterThan(0);

    const auditCalls = (db.recordAuditEvent as ReturnType<typeof vi.fn>).mock.calls as unknown[][];
    const failEvent = auditCalls.find((c) => c[2] === "source.extraction_failed");
    expect(failEvent).toBeDefined();
  });

  it("failed extraction sets version status to FAILED_TERMINAL via setVersionStatus", async () => {
    const brokenDocx = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x00, 0x00, 0x00, 0x00]);
    const db = makeIngestDb();
    const storage = makeStorage();

    await ingestSource(db, storage, {
      tenantId:       TENANT_A,
      userId:         USER_A,
      projectId:      PROJECT,
      name:           "broken.docx",
      mimeType:       "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      idempotencyKey: "idem-fail2",
      fileBytes:      brokenDocx,
    });

    const statusCalls = (db.setVersionStatus as ReturnType<typeof vi.fn>).mock.calls as unknown[][];
    expect(statusCalls).toHaveLength(1);
    expect(statusCalls[0]?.[1]).toBe("FAILED_TERMINAL");
    expect(statusCalls[0]?.[2]).toBeDefined(); // fail_reason must be set
  });
});

// ============================================================
// Successful plain-text ingestion
// ============================================================

describe("Successful txt ingestion", () => {
  it("inserts source, version, fragments and sets EXTRACTED status", async () => {
    const db = makeIngestDb();
    const storage = makeStorage();

    const result = await ingestSource(db, storage, {
      tenantId:       TENANT_A,
      userId:         USER_A,
      projectId:      PROJECT,
      name:           "doc.txt",
      mimeType:       "text/plain",
      idempotencyKey: "idem-ok",
      fileBytes:      VALID_TXT_BYTES,
    });

    expect(result.status).toBe("EXTRACTED");
    expect(result.sourceId).toBe(SOURCE_ID);
    expect(result.versionId).toBe(VERSION_ID);

    expect(db.insertSource).toHaveBeenCalledOnce();
    expect(db.upsertSourceVersion).toHaveBeenCalledOnce();
    expect(db.insertSourceFragments).toHaveBeenCalledOnce();
    expect(db.setVersionStatus).toHaveBeenCalledWith(
      VERSION_ID, "EXTRACTED", undefined,
    );
    expect((storage.put as ReturnType<typeof vi.fn>)).toHaveBeenCalledOnce();
  });

  it("storage.put receives the original bytes and a tenant-prefixed path", async () => {
    const db = makeIngestDb();
    const storage = makeStorage();

    await ingestSource(db, storage, {
      tenantId:       TENANT_A,
      userId:         USER_A,
      projectId:      PROJECT,
      name:           "doc.txt",
      mimeType:       "text/plain",
      idempotencyKey: "idem-path",
      fileBytes:      VALID_TXT_BYTES,
    });

    const putCalls = (storage.put as ReturnType<typeof vi.fn>).mock.calls as unknown[][];
    expect(putCalls).toHaveLength(1);
    // First argument is tenantId
    expect(putCalls[0]?.[0]).toBe(TENANT_A);
    // Third argument is the actual bytes
    expect(putCalls[0]?.[2]).toBe(VALID_TXT_BYTES);
  });
});
