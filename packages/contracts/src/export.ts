/**
 * Export contracts — Phase 9.
 *
 * Zod schemas for the export bundle and permission:
 *   - ExportPermissionSchema — allowed + deniedReason.
 *   - ExportBundleResultSchema — html, htmlSha256, watermarkIntact.
 *
 * Directive Phase 9:
 *   "Export HTML only with permission. Audit it. Watermark intact."
 *
 * Status: Enterprise Candidate — Active Development
 */
import { z } from "zod";

// ============================================================
// Export permission
// ============================================================

export const ExportPermissionSchema = z.object({
  allowed:       z.boolean(),
  deniedReason:  z.string().nullable().optional(),
});
export type ExportPermission = z.infer<typeof ExportPermissionSchema>;

// ============================================================
// Export bundle result
// ============================================================

export const ExportBundleResultSchema = z.object({
  html:             z.string().min(1),
  htmlSha256:       z.string().length(64).regex(/^[0-9a-f]{64}$/),
  watermarkIntact:  z.boolean(),
});
export type ExportBundleResult = z.infer<typeof ExportBundleResultSchema>;
