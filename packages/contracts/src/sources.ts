/**
 * Zod schemas for source upload and retrieval contracts.
 * Status: Enterprise Candidate — Active Development
 */
import { z } from "zod";

/** Allowed MIME types for upload. Must match domain/source.ts ALLOWED_MIME_TYPES. */
export const ALLOWED_MIME_TYPES = [
  "application/pdf",
  "text/plain",
  "text/markdown",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
] as const;

export const AllowedMimeTypeSchema = z.enum(ALLOWED_MIME_TYPES);
export type AllowedMimeType = z.infer<typeof AllowedMimeTypeSchema>;

/** Request schema for uploading a source document. */
export const UploadSourceRequestSchema = z.object({
  projectId:      z.string().uuid(),
  name:           z.string().min(1).max(512),
  mimeType:       AllowedMimeTypeSchema,
  /** Client-supplied idempotency key — server deduplicates on (sourceId, key). */
  idempotencyKey: z.string().min(1).max(256),
});
export type UploadSourceRequest = z.infer<typeof UploadSourceRequestSchema>;

/** Response for a single source version. */
export const SourceVersionResponseSchema = z.object({
  id:             z.string().uuid(),
  sourceId:       z.string().uuid(),
  sha256:         z.string().length(64),
  sizeBytes:      z.number().int().positive(),
  status:         z.enum(["INGESTED", "EXTRACTED", "FAILED_TERMINAL"]),
  failReason:     z.string().nullable(),
  createdAt:      z.string().datetime(),
});
export type SourceVersionResponse = z.infer<typeof SourceVersionResponseSchema>;

/** Response returned after a successful upload (new or idempotent). */
export const UploadSourceResponseSchema = z.object({
  sourceId:      z.string().uuid(),
  versionId:     z.string().uuid(),
  /** true if a pre-existing version matched the idempotency key (no new row created). */
  deduplicated:  z.boolean(),
  status:        z.enum(["INGESTED", "EXTRACTED", "FAILED_TERMINAL"]),
});
export type UploadSourceResponse = z.infer<typeof UploadSourceResponseSchema>;

/** Response for a single source record with its latest version. */
export const SourceResponseSchema = z.object({
  id:           z.string().uuid(),
  projectId:    z.string().uuid(),
  name:         z.string(),
  mimeType:     z.string(),
  latestVersion: SourceVersionResponseSchema.nullable(),
  createdAt:    z.string().datetime(),
});
export type SourceResponse = z.infer<typeof SourceResponseSchema>;

/** A single extracted fragment. */
export const SourceFragmentResponseSchema = z.object({
  id:        z.string().uuid(),
  versionId: z.string().uuid(),
  ordinal:   z.number().int().nonnegative(),
  page:      z.number().int().positive().nullable(),
  text:      z.string(),
  charStart: z.number().int().nonnegative(),
  charEnd:   z.number().int().positive(),
  hash:      z.string().length(64),
});
export type SourceFragmentResponse = z.infer<typeof SourceFragmentResponseSchema>;
