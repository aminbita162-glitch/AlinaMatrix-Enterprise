/**
 * Text extractor for uploaded source documents.
 *
 * Supported formats: txt, md (UTF-8 read), docx (XML unzip), pdf (pdf-parse, offline).
 * On any failure: throw ExtractionError with an English reason.
 * Do not invent text. If extraction fails, the caller must set FAILED_TERMINAL.
 *
 * Status: Enterprise Candidate — Active Development
 */
import { createHash } from "node:crypto";
import { Unzip } from "node:zlib";
import { Readable } from "node:stream";

// ============================================================
// Error
// ============================================================

export class ExtractionError extends Error {
  constructor(
    public readonly reason: string,
    cause?: unknown,
  ) {
    super(`Extraction failed: ${reason}`);
    this.name = "ExtractionError";
    if (cause instanceof Error) {
      this.cause = cause;
    }
  }
}

// ============================================================
// Result
// ============================================================

export interface ExtractionResult {
  /** Concatenated full text of the document. */
  text: string;
  /**
   * Per-page texts for PDF documents.
   * For non-PDF formats this is a single-element array with the full text.
   */
  pageTexts: string[];
  /** Whether page-level metadata is available. */
  hasPages: boolean;
}

// ============================================================
// Plain text / Markdown
// ============================================================

function extractPlainText(buf: Buffer): ExtractionResult {
  const text = buf.toString("utf8");
  return { text, pageTexts: [text], hasPages: false };
}

// ============================================================
// DOCX (OOXML / ZIP)
// ============================================================

/**
 * Extract text from a DOCX buffer by unzipping and parsing word/document.xml.
 * This is a structural XML walk — it does not render layout.
 */
async function extractDocx(buf: Buffer): Promise<ExtractionResult> {
  // Dynamically import fflate (or use built-in unzip) — use Node.js built-ins only.
  // We walk the ZIP by finding the word/document.xml entry manually.
  let xmlText: string;
  try {
    xmlText = await readDocxXml(buf);
  } catch (err) {
    throw new ExtractionError("DOCX ZIP extraction failed: could not read word/document.xml", err);
  }

  // Extract text content from <w:t> elements
  const texts: string[] = [];
  const wt = /<w:t[^>]*>([\s\S]*?)<\/w:t>/g;
  let match: RegExpExecArray | null;
  while ((match = wt.exec(xmlText)) !== null) {
    const t = match[1];
    if (t) texts.push(t);
  }

  if (texts.length === 0) {
    throw new ExtractionError("DOCX extraction produced no text. The document may be empty or use unsupported formatting.");
  }

  const text = texts.join(" ").replace(/\s+/g, " ").trim();
  return { text, pageTexts: [text], hasPages: false };
}

/**
 * Read word/document.xml from a DOCX (ZIP) buffer using Node.js built-ins.
 * Returns the raw XML string.
 */
async function readDocxXml(buf: Buffer): Promise<string> {
  // Parse the ZIP central directory manually using a minimal ZIP reader.
  // A DOCX is a standard ZIP file. We locate the Local File Header for
  // "word/document.xml" and decompress its data.
  const target = "word/document.xml";
  const entry = findZipEntry(buf, target);
  if (!entry) {
    throw new Error(`Entry "${target}" not found in ZIP`);
  }
  const decompressed = await inflate(entry.compressedData, entry.compressionMethod);
  return decompressed.toString("utf8");
}

interface ZipEntry {
  compressionMethod: number;
  compressedData: Buffer;
}

function findZipEntry(buf: Buffer, name: string): ZipEntry | null {
  // Walk Local File Headers (signature 0x04034b50 = PK\x03\x04)
  let offset = 0;
  const PK_LOCAL = 0x04034b50;
  while (offset + 30 <= buf.length) {
    const sig = buf.readUInt32LE(offset);
    if (sig !== PK_LOCAL) break;

    const compressionMethod = buf.readUInt16LE(offset + 8);
    const compressedSize    = buf.readUInt32LE(offset + 18);
    const fileNameLength    = buf.readUInt16LE(offset + 26);
    const extraLength       = buf.readUInt16LE(offset + 28);
    const fileNameStart     = offset + 30;
    const fileName          = buf.subarray(fileNameStart, fileNameStart + fileNameLength).toString("utf8");
    const dataStart         = fileNameStart + fileNameLength + extraLength;
    const compressedData    = buf.subarray(dataStart, dataStart + compressedSize);

    if (fileName === name) {
      return { compressionMethod, compressedData };
    }

    offset = dataStart + compressedSize;
  }
  return null;
}

async function inflate(data: Buffer, method: number): Promise<Buffer> {
  if (method === 0) {
    // Stored (no compression)
    return data;
  }
  if (method === 8) {
    // Deflate
    return new Promise<Buffer>((resolve, reject) => {
      const chunks: Buffer[] = [];
      const stream = new Unzip();
      stream.on("data", (chunk: Buffer) => chunks.push(chunk));
      stream.on("end", () => resolve(Buffer.concat(chunks)));
      stream.on("error", reject);
      const readable = new Readable({
        read() {
          this.push(data);
          this.push(null);
        },
      });
      readable.pipe(stream);
    });
  }
  throw new Error(`Unsupported ZIP compression method: ${method}`);
}

// ============================================================
// PDF
// ============================================================

async function extractPdf(buf: Buffer): Promise<ExtractionResult> {
  let pdfParseModule: { PDFParse: new (opts: { data: Buffer }) => {
    getText(params?: Record<string, unknown>): Promise<{ pages: Array<{ text: string }>; text: string }>;
    destroy(): Promise<void>;
  }};

  try {
    // Dynamic import to isolate the module load failure from the function signature
    pdfParseModule = await import("pdf-parse") as typeof pdfParseModule;
  } catch (err) {
    throw new ExtractionError(
      "PDF parser module (pdf-parse) could not be loaded. PDF extraction is unavailable.",
      err,
    );
  }

  const { PDFParse } = pdfParseModule;

  let result: { pages: Array<{ text: string }>; text: string };

  try {
    const p = new PDFParse({ data: buf });
    result = await p.getText({});
    await p.destroy();
  } catch (err) {
    throw new ExtractionError(
      `PDF text extraction failed. The file may be encrypted, corrupted, or image-only. Reason: ${err instanceof Error ? err.message : String(err)}`,
      err,
    );
  }

  const pageTexts = result.pages.map((p) => p.text ?? "");
  const fullText = result.text ?? pageTexts.join("\n\n");

  if (fullText.trim().length === 0) {
    throw new ExtractionError(
      "PDF extraction produced no text. The document may be image-only (scanned) or empty. OCR is not available in this configuration.",
    );
  }

  return { text: fullText, pageTexts, hasPages: true };
}

// ============================================================
// Public extraction entry point
// ============================================================

export type SupportedMimeType =
  | "text/plain"
  | "text/markdown"
  | "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  | "application/pdf";

/**
 * Extract text from a document buffer.
 *
 * @param buf       Raw file bytes
 * @param mimeType  Declared (and validated) MIME type
 * @returns ExtractionResult on success
 * @throws ExtractionError with an English reason on failure — caller must set FAILED_TERMINAL
 */
export async function extractText(buf: Buffer, mimeType: SupportedMimeType): Promise<ExtractionResult> {
  switch (mimeType) {
    case "text/plain":
    case "text/markdown":
      return extractPlainText(buf);

    case "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
      return extractDocx(buf);

    case "application/pdf":
      return extractPdf(buf);

    default: {
      // TypeScript exhaustiveness guard — the cast is safe because the switch is exhaustive
      const _never: never = mimeType;
      throw new ExtractionError(`Unsupported MIME type: ${String(_never)}`);
    }
  }
}

// Exported for testing
export { findZipEntry, inflate };
export const _sha256 = (s: string) =>
  createHash("sha256").update(s, "utf8").digest("hex");
