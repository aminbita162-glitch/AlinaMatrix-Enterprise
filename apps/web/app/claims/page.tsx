"use client";

import { useEffect, useState } from "react";
import { apiGet, apiPost, getSessionUser, ApiError, type SessionUser, type ClaimResponse, type ClaimDecisionResponse } from "../lib/api";

export default function ClaimsPage() {
  const [claims, setClaims] = useState<ClaimResponse[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [sessionUser, setSessionUser] = useState<SessionUser | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [session, data] = await Promise.all([
          getSessionUser(),
          apiGet<ClaimResponse[]>("/claims"),
        ]);
        if (!cancelled) {
          setSessionUser(session);
          setClaims(data);
        }
      } catch (err: unknown) {
        if (!cancelled) {
          setError(err instanceof ApiError ? err.message : "Failed to load claims.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function decide(claimId: string, decision: "approved" | "rejected") {
    if (!sessionUser) {
      setError("Not authenticated.");
      return;
    }
    setPendingAction(claimId);
    setError(null);
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
      setError(err instanceof ApiError ? err.message : "Failed to update claim.");
    } finally {
      setPendingAction(null);
    }
  }

  return (
    <section style={{ padding: "1.5rem", maxWidth: "1100px" }}>
      <h1 style={{ fontSize: "1.25rem", fontWeight: 700, margin: "0 0 1rem", color: "#f1f5f9" }}>
        Claim Inspector
      </h1>
      {loading && <p style={{ color: "#94a3b8", fontSize: "0.875rem" }}>Loading claims…</p>}
      {error && (
        <p style={{ color: "#f87171", fontSize: "0.875rem", margin: "0 0 1rem" }}>
          Error: {error}
        </p>
      )}
      {!loading && !error && claims.length === 0 && (
        <p style={{ color: "#94a3b8", fontSize: "0.875rem" }}>No claims found.</p>
      )}
      {claims.length > 0 && (
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.8125rem" }}>
          <thead>
            <tr style={{ borderBottom: "1px solid #1e293b", textAlign: "left" }}>
              <th style={{ padding: "0.5rem", color: "#94a3b8", fontWeight: 600 }}>Subject</th>
              <th style={{ padding: "0.5rem", color: "#94a3b8", fontWeight: 600 }}>Predicate</th>
              <th style={{ padding: "0.5rem", color: "#94a3b8", fontWeight: 600 }}>Support</th>
              <th style={{ padding: "0.5rem", color: "#94a3b8", fontWeight: 600 }}>Type</th>
              <th style={{ padding: "0.5rem", color: "#94a3b8", fontWeight: 600 }}>Review</th>
              <th style={{ padding: "0.5rem", color: "#94a3b8", fontWeight: 600 }}>Action</th>
            </tr>
          </thead>
          <tbody>
            {claims.map((c) => (
              <tr key={c.id} style={{ borderBottom: "1px solid #14182a" }}>
                <td style={{ padding: "0.5rem", color: "#e2e8f0", maxWidth: "220px" }}>{c.subject}</td>
                <td style={{ padding: "0.5rem", color: "#94a3b8" }}>{c.predicate}</td>
                <td style={{ padding: "0.5rem", color: "#94a3b8" }}>{c.supportStatus}</td>
                <td style={{ padding: "0.5rem", color: "#94a3b8" }}>{c.claimType}</td>
                <td style={{ padding: "0.5rem" }}>
                  <span
                    style={{
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
                </td>
                <td style={{ padding: "0.5rem", display: "flex", gap: "0.5rem" }}>
                  <button
                    type="button"
                    disabled={pendingAction === c.id}
                    onClick={() => decide(c.id, "approved")}
                    style={btnStyle("#166534")}
                  >
                    Approve
                  </button>
                  <button
                    type="button"
                    disabled={pendingAction === c.id}
                    onClick={() => decide(c.id, "rejected")}
                    style={btnStyle("#991b1b")}
                  >
                    Reject
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

function btnStyle(bg: string): React.CSSProperties {
  return {
    background: bg,
    color: "#f1f5f9",
    border: "1px solid #334155",
    borderRadius: "3px",
    padding: "0.2rem 0.6rem",
    fontSize: "0.75rem",
    cursor: "pointer",
  };
}
