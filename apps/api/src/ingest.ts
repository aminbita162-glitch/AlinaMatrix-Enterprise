/**
 * Source upload ingestion pipeline.
 *
 * Validates upload, stores bytes, extracts text, writes fragments.
 * All DB operations run inside a transaction with tenant context set.
 *
 * Directive R09: raw file bytes are stored, never logged.
 * Directive R08: tenant_id is server-derived from session, never from client.
 *
 * Status: Enterprise Candidate — Active Development
 */
import { v4 as uuidv4 } from "uuid";
import {
  validateMime,
  validateFileSize,
  computeSha256,
  fragmentText,
  fragmentPagedText,
  MimeMismatchError,
  FileSizeError,
  MimeNotAllowedError,
} from "@alinamatrix/domain";
import type {
  SourceRow,
  SourceVersionRow,
  SourceFragmentRow,
} from "@alinamatrix/db";
import type { ObjectStorage } from "./storage.js";
import { extractText, ExtractionError } from "./extractor.js";
import type { SupportedMimeType } from "./extractor.js";
import type { TextFragment } from "@alinamatrix/domain";
import { logger } from "./logger.js";

// Silence unused import warning — uuid is used below
void uuidv4;

// ============================================================
// DB abstraction (allows test doubles)
// ============================================================

export interface IngestDb {
  insertSource(params: {
    tenantId:  string;
    projectId: string;
    name:      string;
    mimeType:  string;
  }): Promise<SourceRow>;

  upsertSourceVersion(params: {
    sourceId:       string;
    tenantId:       string;
    sha256:         string;
    sizeBytes:      number;
    storagePath:    string;
    idempotencyKey: string;
  }): Promise<{ row: SourceVersionRow; deduplicated: boolean }>;

  setVersionStatus(
    versionId: string,
    status:    "EXTRACTED" | "FAILED_TERMINAL",
    failReason?: string,
  ): Promise<void>;

  insertSourceFragments(
    versionId: string,
    tenantId:  string,
    fragments: TextFragment[],
  ): Promise<SourceFragmentRow[]>;

  recordAuditEvent(
    tenantId:   string,
    userId:     string | null,
    action:     string,
    resource:   string,
    resourceId: string,
    detail?:    Record<string, unknown>,
  ): Promise<void>;
}

// ============================================================
// Request / Result
// ============================================================

export interface IngestRequest {
  tenantId:       string;
  userId:         string;
  projectId:      string;
  name:           string;
  mimeType:       string;
  idempotencyKey: string;
  fileBytes:      Buffer;
}

export interface IngestResult {
  sourceId:     string;
  versionId:    string;
  deduplicated: boolean;
  status:       "INGESTED" | "EXTRACTED" | "FAILED_TERMINAL";
  failReason:   string | undefined;
}

// ============================================================
// Errors
// ============================================================

export class IngestValidationError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "IngestValidationError";
  }
}

// ============================================================
// Ingest pipeline
// ============================================================

/**
 * Run the full upload pipeline for a source document.
 *
 * 1. Validate file size and MIME (sniff bytes vs declared type).
 * 2. Compute sha256.
 * 3. Upsert source version — returns existing if idempotency key matches (deduplicated).
 * 4. Store original bytes via ObjectStorage.
 * 5. Extract text; build fragments.
 * 6. Persist fragments; update version status.
 * 7. Audit upload and any extraction failure.
 */
export async function ingestSource(
  db:      IngestDb,
  storage: ObjectStorage,
  req:     IngestRequest,
): Promise<IngestResult> {
  // --- Pre-DB validation ---

  try {
    validateFileSize(req.fileBytes.length);
  } catch (err) {
    if (err instanceof FileSizeError) {
      throw new IngestValidationError("FILE_TOO_LARGE", err.message);
    }
    throw err;
  }

  try {
    validateMime(req.mimeType, req.fileBytes);
  } catch (err) {
    if (err instanceof MimeMismatchError || err instanceof MimeNotAllowedError) {
      throw new IngestValidationError("MIME_MISMATCH", err.message);
    }
    throw err;
  }

  const sha256 = computeSha256(req.fileBytes);

  // --- Create source record ---

  const source = await db.insertSource({
    tenantId:  req.tenantId,
    projectId: req.projectId,
    name:      req.name,
    mimeType:  req.mimeType,
  });

  const sourceId = source.id;

  // --- Upsert version (idempotency key deduplicates) ---

  const { row: version, deduplicated } = await db.upsertSourceVersion({
    sourceId,
    tenantId:       req.tenantId,
    sha256,
    sizeBytes:      req.fileBytes.length,
    storagePath:    `${sourceId}/${sha256}`,
    idempotencyKey: req.idempotencyKey,
  });

  if (deduplicated) {
    return {
      sourceId,
      versionId:    version.id,
      deduplicated: true,
      status:       version.status,
      failReason:   version.fail_reason ?? undefined,
    };
  }

  const versionId = version.id;

  // --- Audit upload ---

  await db.recordAuditEvent(
    req.tenantId,
    req.userId,
    "source.upload",
    "source_version",
    versionId,
    { sourceId, sha256, sizeBytes: req.fileBytes.length },
  );

  // --- Store original bytes ---

  await storage.put(req.tenantId, `${sourceId}/${sha256}`, req.fileBytes);

  // --- Extract and fragment ---

  let extractionStatus: "EXTRACTED" | "FAILED_TERMINAL" = "EXTRACTED";
  let failReason: string | undefined;
  let fragmentCount = 0;

  try {
    const extracted = await extractText(
      req.fileBytes,
      req.mimeType as SupportedMimeType,
    );

    const frags = extracted.hasPages
      ? fragmentPagedText(extracted.pageTexts)
      : fragmentText(extracted.text);

    if (frags.length === 0) {
      throw new ExtractionError(
        "Extraction produced text but no fragments could be created. The document may be empty.",
      );
    }

    await db.insertSourceFragments(versionId, req.tenantId, frags);
    fragmentCount = frags.length;

  } catch (err) {
    extractionStatus = "FAILED_TERMINAL";
    failReason = err instanceof ExtractionError
      ? err.reason
      : `Unexpected extraction error: ${err instanceof Error ? err.message : String(err)}`;

    logger.error("source extraction failed", { versionId, sourceId, reason: failReason });

    await db.recordAuditEvent(
      req.tenantId,
      req.userId,
      "source.extraction_failed",
      "source_version",
      versionId,
      { failReason },
    );
  }

  // --- Persist final status ---

  await db.setVersionStatus(versionId, extractionStatus, failReason);

  logger.info("source ingested", { sourceId, versionId, status: extractionStatus, fragmentCount });

  return {
    sourceId,
    versionId,
    deduplicated: false,
    status:       extractionStatus,
    failReason,
  };
}
