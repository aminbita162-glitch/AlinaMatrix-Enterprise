"use client";

import { useEffect, useState } from "react";
import { apiGet, ApiError, type ReviewTaskResponse } from "../lib/api";

export default function ReviewQueuePage() {
  const [tasks, setTasks] = useState<ReviewTaskResponse[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await apiGet<ReviewTaskResponse[]>("/review-tasks");
        if (!cancelled) setTasks(data);
      } catch (err: unknown) {
        if (!cancelled) {
          setError(err instanceof ApiError ? err.message : "Failed to load review tasks.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <section style={{ padding: "1.5rem", maxWidth: "960px" }}>
      <h1 style={{ fontSize: "1.25rem", fontWeight: 700, margin: "0 0 1rem", color: "#f1f5f9" }}>
        Review Queue
      </h1>
      {loading && <p style={{ color: "#94a3b8", fontSize: "0.875rem" }}>Loading review tasks…</p>}
      {error && (
        <p style={{ color: "#f87171", fontSize: "0.875rem", margin: 0 }}>
          Error: {error}
        </p>
      )}
      {!loading && !error && tasks.length === 0 && (
        <p style={{ color: "#94a3b8", fontSize: "0.875rem" }}>No open review tasks.</p>
      )}
      {tasks.length > 0 && (
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.8125rem" }}>
          <thead>
            <tr style={{ borderBottom: "1px solid #1e293b", textAlign: "left" }}>
              <th style={{ padding: "0.5rem", color: "#94a3b8", fontWeight: 600 }}>State</th>
              <th style={{ padding: "0.5rem", color: "#94a3b8", fontWeight: 600 }}>Task ID</th>
              <th style={{ padding: "0.5rem", color: "#94a3b8", fontWeight: 600 }}>Project</th>
              <th style={{ padding: "0.5rem", color: "#94a3b8", fontWeight: 600 }}>Created</th>
              <th style={{ padding: "0.5rem", color: "#94a3b8", fontWeight: 600 }}></th>
            </tr>
          </thead>
          <tbody>
            {tasks.map((t) => (
              <tr key={t.id} style={{ borderBottom: "1px solid #14182a" }}>
                <td style={{ padding: "0.5rem" }}>
                  <span
                    style={{
                      color:
                        t.state === "approved"
                          ? "#34d399"
                          : t.state === "rejected"
                            ? "#f87171"
                            : "#fbbf24",
                    }}
                  >
                    {t.state}
                  </span>
                </td>
                <td style={{ padding: "0.5rem", color: "#94a3b8", fontFamily: "monospace" }}>{t.id}</td>
                <td style={{ padding: "0.5rem", color: "#94a3b8", fontFamily: "monospace" }}>{t.projectId}</td>
                <td style={{ padding: "0.5rem", color: "#94a3b8" }}>{t.createdAt}</td>
                <td style={{ padding: "0.5rem" }}>
                  <a
                    href={`/review/${t.id}`}
                    style={{
                      color: "#7c5cd8",
                      textDecoration: "none",
                      fontSize: "0.8125rem",
                    }}
                  >
                    Open →
                  </a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
