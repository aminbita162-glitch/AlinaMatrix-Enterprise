"use client";

import { useEffect, useState, use } from "react";
import {
  apiGet,
  apiPost,
  getSessionUser,
  ApiError,
  type SessionUser,
  type ReviewTaskDetailResponse,
  type SourceFragmentResponse,
  type ClaimResponse,
  type ClaimDecisionResponse,
} from "../../lib/api";

interface Props {
  params: Promise<{ taskId: string }>;
}

export default function ReviewTaskDetailPage({ params }: Props) {
  const { taskId } = use(params);
  const [detail, setDetail] = useState<ReviewTaskDetailResponse | null>(null);
  const [fragments, setFragments] = useState<SourceFragmentResponse[]>([]);
  const [claims, setClaims] = useState<ClaimResponse[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [commentBody, setCommentBody] = useState("");
  const [commentError, setCommentError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [sessionUser, setSessionUser] = useState<SessionUser | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [session, taskDetail, fragmentList, claimList] = await Promise.all([
          getSessionUser(),
          apiGet<ReviewTaskDetailResponse>(`/review-tasks/${taskId}`),
          apiGet<SourceFragmentResponse[]>(`/review-tasks/${taskId}/fragments`).catch(
            () => [] as SourceFragmentResponse[],
          ),
          apiGet<ClaimResponse[]>(`/review-tasks/${taskId}/claims`).catch(
            () => [] as ClaimResponse[],
          ),
        ]);
        if (cancelled) return;
        setSessionUser(session);
        setDetail(taskDetail);
        setFragments(fragmentList);
        setClaims(claimList);
      } catch (err: unknown) {
        if (!cancelled) {
          setError(err instanceof ApiError ? err.message : "Failed to load review task.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [taskId]);

  async function submitComment() {
    if (!sessionUser) {
      setCommentError("Not authenticated.");
      return;
    }
    if (!commentBody.trim()) {
      setCommentError("Comment body must not be empty.");
      return;
    }
    setCommentError(null);
    try {
      await apiPost(`/review-tasks/${taskId}/comments`, {
        authorId: sessionUser.userId,
        body: commentBody.trim(),
      });
      setCommentBody("");
      const refreshed = await apiGet<ReviewTaskDetailResponse>(`/review-tasks/${taskId}`);
      setDetail(refreshed);
    } catch (err: unknown) {
      setCommentError(err instanceof ApiError ? err.message : "Failed to add comment.");
    }
  }

  async function submitApproval() {
    if (!sessionUser) {
      setActionError("Not authenticated.");
      return;
    }
    setActionError(null);
    try {
      await apiPost(`/review-tasks/${taskId}/approvals`, {
        approverId: sessionUser.userId,
        decision: "approved",
      });
      const refreshed = await apiGet<ReviewTaskDetailResponse>(`/review-tasks/${taskId}`);
      setDetail(refreshed);
    } catch (err: unknown) {
      setActionError(err instanceof ApiError ? err.message : "Failed to submit approval.");
    }
  }

  async function decideClaim(claimId: string, decision: "approved" | "rejected") {
    if (!sessionUser) {
      setActionError("Not authenticated.");
      return;
    }
    setActionError(null);
    try {
      const result = await apiPost<ClaimDecisionResponse>(`/claims/${claimId}/decision`, {
        decision,
        reviewerId: sessionUser.userId,
      });
      setClaims((prev) =>
        prev.map((c) =>
          c.id === result.claimId
            ? { ...c, reviewerStatus: result.reviewerStatus }
            : c,
        ),
      );
    } catch (err: unknown) {
      setActionError(err instanceof ApiError ? err.message : "Failed to update claim.");
    }
  }

  if (loading) {
    return (
      <section style={{ padding: "1.5rem" }}>
        <p style={{ color: "#94a3b8", fontSize: "0.875rem" }}>Loading review task…</p>
      </section>
    );
  }

  if (error || !detail) {
    return (
      <section style={{ padding: "1.5rem" }}>
        <p style={{ color: "#f87171", fontSize: "0.875rem" }}>
          Error: {error ?? "Review task not found."}
        </p>
      </section>
    );
  }

  const task = detail.task;
  const approvals = detail.approvals;
  const comments = detail.comments;
  const hasRejectedClaim = claims.some((c) => c.reviewerStatus === "rejected");

  return (
    <section style={{ padding: "1.5rem", maxWidth: "1280px" }}>
      <div style={{ marginBottom: "1rem" }}>
        <a href="/review" style={{ color: "#7c5cd8", textDecoration: "none", fontSize: "0.8125rem" }}>
          ← Back to queue
        </a>
        <h1 style={{ fontSize: "1.1rem", fontWeight: 700, margin: "0.5rem 0 0", color: "#f1f5f9" }}>
          Review Task {task.id}
        </h1>
        <p style={{ fontSize: "0.8125rem", color: "#94a3b8", margin: "0.25rem 0 0" }}>
          State:{" "}
          <span
            style={{
              color:
                task.state === "approved"
                  ? "#34d399"
                  : task.state === "rejected"
                    ? "#f87171"
                    : "#fbbf24",
            }}
          >
            {task.state}
          </span>
          {" — Author: "}
          <code style={{ color: "#94a3b8" }}>{task.authorId}</code>
        </p>
        {hasRejectedClaim && (
          <p style={{ color: "#f87171", fontSize: "0.8125rem", margin: "0.5rem 0 0" }}>
            Cannot complete review: one or more claims are rejected. Address rejections before approving.
          </p>
        )}
        {actionError && (
          <p style={{ color: "#f87171", fontSize: "0.8125rem", margin: "0.5rem 0 0" }}>
            Action error: {actionError}
          </p>
        )}
      </div>

      {/* Three-pane layout: fragments | content | findings */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1.2fr 1fr",
          gap: "1rem",
          alignItems: "start",
        }}
      >
        {/* Pane 1: Fragments */}
        <div
          style={{
            border: "1px solid #1e293b",
            borderRadius: "4px",
            padding: "1rem",
            background: "#0f0f17",
          }}
        >
          <h2 style={paneTitle}>Fragments</h2>
          {fragments.length === 0 ? (
            <p style={emptyText}>No fragments available.</p>
          ) : (
            <ol style={{ paddingLeft: "1rem", margin: 0 }}>
              {fragments.map((f) => (
                <li key={f.id} style={{ marginBottom: "0.75rem" }}>
                  <p style={{ fontSize: "0.7rem", color: "#7c5cd8", margin: "0 0 0.2rem" }}>
                    #{f.ordinal}
                    {f.page !== null ? ` — page ${f.page}` : ""}
                  </p>
                  <p style={{ fontSize: "0.8125rem", color: "#cbd5e1", margin: 0, lineHeight: 1.5 }}>
                    {f.text.slice(0, 240)}
                    {f.text.length > 240 ? "…" : ""}
                  </p>
                </li>
              ))}
            </ol>
          )}
        </div>

        {/* Pane 2: Content section (comments — immutable) */}
        <div
          style={{
            border: "1px solid #1e293b",
            borderRadius: "4px",
            padding: "1rem",
            background: "#0f0f17",
          }}
        >
          <h2 style={paneTitle}>Content — Comments</h2>
          <p style={{ fontSize: "0.7rem", color: "#64748b", margin: "0 0 0.5rem" }}>
            Comments are immutable. A correction is a new comment, not an edit.
          </p>
          {comments.length === 0 ? (
            <p style={emptyText}>No comments yet.</p>
          ) : (
            <ul style={{ listStyle: "none", padding: 0, margin: "0 0 1rem" }}>
              {comments.map((c) => (
                <li
                  key={c.id}
                  style={{
                    borderBottom: "1px solid #14182a",
                    padding: "0.5rem 0",
                  }}
                >
                  <p style={{ fontSize: "0.8125rem", color: "#cbd5e1", margin: 0 }}>{c.body}</p>
                  <p style={{ fontSize: "0.7rem", color: "#64748b", margin: "0.2rem 0 0" }}>
                    {c.authorId.slice(0, 8)}… — {c.createdAt}
                  </p>
                </li>
              ))}
            </ul>
          )}
          <div style={{ marginTop: "0.5rem" }}>
            <textarea
              value={commentBody}
              onChange={(e) => setCommentBody(e.target.value)}
              rows={3}
              placeholder="Add an immutable comment…"
              style={{
                width: "100%",
                background: "#0a0a0f",
                border: "1px solid #334155",
                borderRadius: "3px",
                color: "#e2e8f0",
                padding: "0.5rem",
                fontSize: "0.8125rem",
                fontFamily: "inherit",
                resize: "vertical",
              }}
            />
            {commentError && (
              <p style={{ color: "#f87171", fontSize: "0.7rem", margin: "0.3rem 0 0" }}>
                {commentError}
              </p>
            )}
            <button
              type="button"
              onClick={submitComment}
              style={{
                marginTop: "0.5rem",
                background: "#4338ca",
                color: "#f1f5f9",
                border: "1px solid #6366f1",
                borderRadius: "3px",
                padding: "0.3rem 0.8rem",
                fontSize: "0.75rem",
                cursor: "pointer",
              }}
            >
              Add Comment
            </button>
          </div>
        </div>

        {/* Pane 3: Findings (approvals + claims) */}
        <div
          style={{
            border: "1px solid #1e293b",
            borderRadius: "4px",
            padding: "1rem",
            background: "#0f0f17",
          }}
        >
          <h2 style={paneTitle}>Findings</h2>

          {/* Approvals */}
          <h3 style={subTitle}>Approvals</h3>
          {approvals.length === 0 ? (
            <p style={emptyText}>No approvals recorded.</p>
          ) : (
            <ul style={{ listStyle: "none", padding: 0, margin: "0 0 1rem" }}>
              {approvals.map((a) => (
                <li key={a.id} style={{ borderBottom: "1px solid #14182a", padding: "0.4rem 0" }}>
                  <span
                    style={{
                      color: a.decision === "approved" ? "#34d399" : "#f87171",
                      fontSize: "0.8125rem",
                    }}
                  >
                    {a.decision}
                  </span>
                  <span style={{ color: "#64748b", fontSize: "0.7rem", marginLeft: "0.5rem" }}>
                    — {a.approverId.slice(0, 8)}…
                  </span>
                  {a.note && (
                    <p style={{ color: "#94a3b8", fontSize: "0.7rem", margin: "0.2rem 0 0" }}>{a.note}</p>
                  )}
                </li>
              ))}
            </ul>
          )}
          <button
            type="button"
            onClick={submitApproval}
            style={{
              background: "#166534",
              color: "#f1f5f9",
              border: "1px solid #334155",
              borderRadius: "3px",
              padding: "0.3rem 0.8rem",
              fontSize: "0.75rem",
              cursor: "pointer",
              marginBottom: "1rem",
            }}
          >
            Submit Approval (four-eyes enforced)
          </button>

          {/* Claims */}
          <h3 style={subTitle}>Claims</h3>
          {claims.length === 0 ? (
            <p style={emptyText}>No claims linked to this task.</p>
          ) : (
            <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
              {claims.map((c) => (
                <li key={c.id} style={{ borderBottom: "1px solid #14182a", padding: "0.4rem 0" }}>
                  <p style={{ fontSize: "0.8125rem", color: "#cbd5e1", margin: 0 }}>{c.subject}</p>
                  <p style={{ fontSize: "0.7rem", color: "#64748b", margin: "0.2rem 0" }}>
                    {c.predicate} — support: {c.supportStatus}
                  </p>
                  <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", marginTop: "0.3rem" }}>
                    <span
                      style={{
                        fontSize: "0.7rem",
                        color:
                          c.reviewerStatus === "accepted"
                            ? "#34d399"
                            : c.reviewerStatus === "rejected"
                              ? "#f87171"
                              : "#fbbf24",
                      }}
                    >
                      {c.reviewerStatus}
                    </span>
                    <button
                      type="button"
                      onClick={() => decideClaim(c.id, "approved")}
                      style={miniBtn("#166534")}
                    >
                      ✓
                    </button>
                    <button
                      type="button"
                      onClick={() => decideClaim(c.id, "rejected")}
                      style={miniBtn("#991b1b")}
                    >
                      ✗
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}

const paneTitle: React.CSSProperties = {
  fontSize: "0.9rem",
  fontWeight: 700,
  color: "#f1f5f9",
  margin: "0 0 0.75rem",
  paddingBottom: "0.4rem",
  borderBottom: "1px solid #1e293b",
};

const subTitle: React.CSSProperties = {
  fontSize: "0.8rem",
  fontWeight: 600,
  color: "#94a3b8",
  margin: "0 0 0.4rem",
  textTransform: "uppercase",
  letterSpacing: "0.05em",
};

const emptyText: React.CSSProperties = {
  fontSize: "0.8125rem",
  color: "#64748b",
  margin: 0,
};

function miniBtn(bg: string): React.CSSProperties {
  return {
    background: bg,
    color: "#f1f5f9",
    border: "1px solid #334155",
    borderRadius: "2px",
    padding: "0.1rem 0.4rem",
    fontSize: "0.7rem",
    cursor: "pointer",
  };
}
