/**
 * Logger with secret redaction.
 * Directive R09: Do not log secrets, raw documents, or full prompts.
 *
 * Status: Enterprise Candidate — Active Development
 */

/** Patterns that indicate a secret-shaped string. */
const SECRET_PATTERNS: RegExp[] = [
  // argon2id hash
  /\$argon2id\$[^\s"']+/g,
  // Bearer token
  /Bearer\s+[A-Za-z0-9\-._~+/]+=*/gi,
  // Hex string 40+ chars (e.g. SHA-256 digest, session token)
  /\b[0-9a-fA-F]{40,}\b/g,
  // base64 that looks like a token: 32+ chars of base64 chars with =padding
  /\b[A-Za-z0-9+/]{32,}={0,2}\b/g,
];

const REDACTED = "[REDACTED]";

/**
 * Redact secret-shaped strings from a message before logging.
 * Only operates on the serialised string, not on structured fields.
 */
export function redact(value: unknown): string {
  let s = typeof value === "string" ? value : JSON.stringify(value);
  for (const pattern of SECRET_PATTERNS) {
    s = s.replace(pattern, REDACTED);
  }
  return s;
}

export type LogLevel = "info" | "warn" | "error" | "debug";

function write(level: LogLevel, message: string, meta?: unknown): void {
  const entry = {
    level,
    time: new Date().toISOString(),
    msg: redact(message),
    ...(meta !== undefined ? { meta: JSON.parse(redact(JSON.stringify(meta))) } : {}),
  };
  // Direct to stdout for structured consumption; errors to stderr
  if (level === "error") {
    process.stderr.write(JSON.stringify(entry) + "\n");
  } else {
    process.stdout.write(JSON.stringify(entry) + "\n");
  }
}

export const logger = {
  info: (msg: string, meta?: unknown) => write("info", msg, meta),
  warn: (msg: string, meta?: unknown) => write("warn", msg, meta),
  error: (msg: string, meta?: unknown) => write("error", msg, meta),
  debug: (msg: string, meta?: unknown) => write("debug", msg, meta),
};
