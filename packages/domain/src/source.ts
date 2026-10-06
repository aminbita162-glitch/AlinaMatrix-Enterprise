/**
 * Domain helpers for source documents.
 * MIME validation, size cap, sha256, and text fragmentation.
 *
 * Status: Enterprise Candidate — Active Development
 */
import { createHash } from "node:crypto";

// ============================================================
// Constants
// ============================================================

/** Maximum upload size: 50 MB */
export const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;

/** Allowed MIME types. Must stay in sync with packages/contracts/src/sources.ts. */
export const ALLOWED_MIME_TYPES = new Set([
  "application/pdf",
  "text/plain",
  "text/markdown",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
]);

/**
 * Maps file extension (lowercase, without dot) to canonical MIME type.
 * Used to derive expected MIME from the uploaded filename.
 */
export const EXTENSION_TO_MIME: Readonly<Record<string, string>> = {
  pdf:  "application/pdf",
  txt:  "text/plain",
  md:   "text/markdown",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
};

/**
 * Magic byte signatures for MIME sniffing.
 * Only formats relevant to Phase 3 are included.
 */
const MAGIC_SIGNATURES: Array<{ mime: string; bytes: number[]; offset?: number }> = [
  // PDF: %PDF
  { mime: "application/pdf", bytes: [0x25, 0x50, 0x44, 0x46] },
  // DOCX (ZIP-based): PK\x03\x04
  {
    mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    bytes: [0x50, 0x4b, 0x03, 0x04],
  },
];

// ============================================================
// Errors
// ============================================================

export class MimeMismatchError extends Error {
  constructor(declared: string, sniffed: string) {
    super(
      `MIME type mismatch: declared "${declared}" but file content indicates "${sniffed}". Upload rejected.`,
    );
    this.name = "MimeMismatchError";
  }
}

export class FileSizeError extends Error {
  constructor(sizeBytes: number) {
    super(
      `File size ${sizeBytes} bytes exceeds maximum allowed ${MAX_UPLOAD_BYTES} bytes (50 MB).`,
    );
    this.name = "FileSizeError";
  }
}

export class MimeNotAllowedError extends Error {
  constructor(mime: string) {
    super(
      `MIME type "${mime}" is not allowed. Allowed types: ${[...ALLOWED_MIME_TYPES].join(", ")}.`,
    );
    this.name = "MimeNotAllowedError";
  }
}

// ============================================================
// MIME sniffing
// ============================================================

/**
 * Sniff the MIME type of a buffer using magic bytes.
 * Returns null when the content does not match any known signature
 * (text/plain and text/markdown have no reliable magic bytes).
 */
export function sniffMimeType(buf: Buffer): string | null {
  for (const sig of MAGIC_SIGNATURES) {
    const offset = sig.offset ?? 0;
    if (buf.length < offset + sig.bytes.length) continue;
    const matches = sig.bytes.every((b, i) => buf[offset + i] === b);
    if (matches) return sig.mime;
  }
  return null;
}

/**
 * Validate that the declared MIME type is allowed and matches the actual content.
 *
 * Rules:
 * 1. Declared type must be in ALLOWED_MIME_TYPES.
 * 2. If magic bytes indicate a BINARY type (PDF, DOCX) and the declared type differs → reject.
 * 3. If magic bytes return null (text types), accept the declared type as-is.
 * 4. If magic bytes return a BINARY type but the declared type claims text → reject.
 */
export function validateMime(declaredMime: string, buf: Buffer): void {
  if (!ALLOWED_MIME_TYPES.has(declaredMime)) {
    throw new MimeNotAllowedError(declaredMime);
  }

  const sniffed = sniffMimeType(buf);

  if (sniffed !== null && sniffed !== declaredMime) {
    throw new MimeMismatchError(declaredMime, sniffed);
  }

  // If sniffed is null but a BINARY signature would have matched
  // a different declared MIME, we cannot be sure — accept text types.
  // But if the declared type is a binary type and we did NOT sniff it → reject.
  const binaryMimes = new Set(MAGIC_SIGNATURES.map((s) => s.mime));
  if (binaryMimes.has(declaredMime) && sniffed === null) {
    throw new MimeMismatchError(declaredMime, "unknown (magic bytes not found)");
  }
}

// ============================================================
// Size validation
// ============================================================

export function validateFileSize(sizeBytes: number): void {
  if (sizeBytes > MAX_UPLOAD_BYTES) {
    throw new FileSizeError(sizeBytes);
  }
}

// ============================================================
// SHA-256
// ============================================================

/** Compute hex-encoded SHA-256 of a buffer. */
export function computeSha256(buf: Buffer): string {
  return createHash("sha256").update(buf).digest("hex");
}

/** Compute hex-encoded SHA-256 of a string (UTF-8). */
export function computeSha256String(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

// ============================================================
// Fragmentation
// ============================================================

export interface TextFragment {
  ordinal:   number;
  page:      number | null;
  text:      string;
  charStart: number;
  charEnd:   number;
  hash:      string;
}

/**
 * Split plain text into fragments.
 *
 * Strategy:
 * - Split on double-newline (paragraph boundaries) to create fragments.
 * - Skip empty fragments.
 * - Assign sequential ordinals.
 * - Page is always null for plain-text extraction (no page metadata).
 * - Hash is SHA-256 of the fragment text.
 */
export function fragmentText(text: string): TextFragment[] {
  const paragraphs = text.split(/\n{2,}/);
  const fragments: TextFragment[] = [];
  let cursor = 0;

  for (const para of paragraphs) {
    const trimmed = para.trim();
    if (trimmed.length === 0) {
      cursor += para.length + 2; // account for the consumed double-newline
      continue;
    }

    // Find the actual start position of this paragraph in the original text
    const startInFull = text.indexOf(trimmed, cursor);
    const endInFull = startInFull + trimmed.length;

    fragments.push({
      ordinal:   fragments.length,
      page:      null,
      text:      trimmed,
      charStart: startInFull,
      charEnd:   endInFull,
      hash:      computeSha256String(trimmed),
    });

    cursor = endInFull;
  }

  return fragments;
}

/**
 * Split PDF-extracted text into page-aware fragments.
 * `pageTexts` is an array of per-page text strings.
 */
export function fragmentPagedText(pageTexts: string[]): TextFragment[] {
  const fragments: TextFragment[] = [];
  let globalCursor = 0;
  let ordinal = 0;
  const fullText = pageTexts.join("\n\n");

  for (let pageIdx = 0; pageIdx < pageTexts.length; pageIdx++) {
    const pageNum = pageIdx + 1;
    const pageText = pageTexts[pageIdx]!;
    const paragraphs = pageText.split(/\n{2,}/);

    let pageCursor = 0;

    for (const para of paragraphs) {
      const trimmed = para.trim();
      if (trimmed.length === 0) {
        pageCursor += para.length + 2;
        continue;
      }

      const startInPage = pageText.indexOf(trimmed, pageCursor);
      const endInPage = startInPage + trimmed.length;

      // global offset: need the actual offset in the full concatenated text
      const startInFull = fullText.indexOf(trimmed, globalCursor);
      const endInFull = startInFull + trimmed.length;

      fragments.push({
        ordinal,
        page:      pageNum,
        text:      trimmed,
        charStart: startInFull >= 0 ? startInFull : globalCursor,
        charEnd:   startInFull >= 0 ? endInFull   : globalCursor + trimmed.length,
        hash:      computeSha256String(trimmed),
      });

      ordinal++;
      pageCursor = endInPage;
      globalCursor = startInFull >= 0 ? endInFull : globalCursor + trimmed.length;
    }

    // Skip the inter-page separator "\n\n"
    globalCursor = Math.max(globalCursor, fullText.indexOf(pageText, 0) + pageText.length + 2);
  }

  return fragments;
}
