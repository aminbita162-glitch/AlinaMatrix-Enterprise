/**
 * Minimal API client for the review UI.
 *
 * The API base URL is configurable via NEXT_PUBLIC_API_BASE_URL
 * (defaults to http://localhost:4000). All routes are tenant-scoped
 * via the session cookie resolved by the API.
 *
 * Status: Enterprise Candidate — Active Development
 */

const API_BASE =
  (typeof process !== "undefined" && process.env.NEXT_PUBLIC_API_BASE_URL) ||
  "http://localhost:4000";

export class ApiError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

export async function apiGet<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    credentials: "include",
    headers: { Accept: "application/json" },
  });
  const text = await res.text();
  if (!res.ok) {
    let detail = `Request failed with status ${res.status}`;
    try {
      const parsed = JSON.parse(text) as { error?: string };
      if (parsed.error) detail = parsed.error;
    } catch {
      // keep default
    }
    throw new ApiError(res.status, detail);
  }
  if (!text) return undefined as unknown as T;
  return JSON.parse(text) as T;
}

export async function apiPost<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) {
    let detail = `Request failed with status ${res.status}`;
    try {
      const parsed = JSON.parse(text) as { error?: string };
      if (parsed.error) detail = parsed.error;
    } catch {
      // keep default
    }
    throw new ApiError(res.status, detail);
  }
  if (!text) return undefined as unknown as T;
  return JSON.parse(text) as T;
}

// ---------------------------------------------------------------------------
// Session — the authenticated user id is server-derived from the HttpOnly
// session cookie. The web client cannot read the cookie, so it fetches the
// current session via GET /auth/me and uses that userId for reviewer/
// approver/author fields — never a hardcoded id.
// ---------------------------------------------------------------------------

export interface SessionUser {
  userId: string;
  tenantId: string;
}

/**
 * Fetch the current session user from the API.
 * Returns null when there is no authenticated session (401).
 */
export async function getSessionUser(): Promise<SessionUser | null> {
  try {
    return await apiGet<SessionUser>("/auth/me");
  } catch (err: unknown) {
    if (err instanceof ApiError && err.status === 401) return null;
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Response shapes (mirror packages/contracts/src/review.ts)
// ---------------------------------------------------------------------------

export interface ReviewTaskResponse {
  id: string;
  tenantId: string;
  projectId: string;
  workflowRunId: string;
  draftId: string | null;
  authorId: string;
  state: "open" | "approved" | "rejected";
  createdAt: string;
  updatedAt: string;
}

export interface ApprovalResponse {
  id: string;
  tenantId: string;
  taskId: string;
  approverId: string;
  decision: "approved" | "rejected";
  note: string | null;
  createdAt: string;
}

export interface CommentResponse {
  id: string;
  tenantId: string;
  taskId: string;
  authorId: string;
  body: string;
  createdAt: string;
}

export interface ReviewTaskDetailResponse {
  task: ReviewTaskResponse;
  approvals: ApprovalResponse[];
  comments: CommentResponse[];
}

export interface ClaimResponse {
  id: string;
  projectId: string;
  subject: string;
  predicate: string;
  object: string;
  qualifier: string | null;
  timeScope: string | null;
  unit: string | null;
  claimText: string;
  claimType: "witnessed" | "inferred" | "assumption";
  supportStatus: "supported" | "weak" | "unsupported" | "conflicting" | "not_applicable";
  negativeEvidenceNote: string | null;
  evidenceIds: string[];
  confidence: number | null;
  contradictionStatus: "none" | "flagged" | "resolved";
  generated: boolean;
  reviewerStatus: "pending" | "accepted" | "rejected";
  createdAt: string;
  updatedAt: string;
}

export interface ClaimDecisionResponse {
  claimId: string;
  reviewerStatus: "pending" | "accepted" | "rejected";
}

export interface SourceResponse {
  id: string;
  projectId: string;
  name: string;
  mimeType: string;
  latestVersion: {
    id: string;
    sourceId: string;
    sha256: string;
    sizeBytes: number;
    status: "INGESTED" | "EXTRACTED" | "FAILED_TERMINAL";
    failReason: string | null;
    createdAt: string;
  } | null;
  createdAt: string;
}

export interface SourceFragmentResponse {
  id: string;
  versionId: string;
  ordinal: number;
  page: number | null;
  text: string;
  charStart: number;
  charEnd: number;
  hash: string;
}

export { API_BASE };
