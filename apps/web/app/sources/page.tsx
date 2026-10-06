"use client";

import { useEffect, useState } from "react";
import { apiGet, ApiError, type SourceResponse } from "../lib/api";

export default function SourcesPage() {
  const [sources, setSources] = useState<SourceResponse[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await apiGet<SourceResponse[]>("/sources");
        if (!cancelled) setSources(data);
      } catch (err: unknown) {
        if (!cancelled) {
          setError(err instanceof ApiError ? err.message : "Failed to load sources.");
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
        Sources
      </h1>
      {loading && <p style={{ color: "#94a3b8", fontSize: "0.875rem" }}>Loading sources…</p>}
      {error && (
        <p style={{ color: "#f87171", fontSize: "0.875rem", margin: 0 }}>
          Error: {error}
        </p>
      )}
      {!loading && !error && sources.length === 0 && (
        <p style={{ color: "#94a3b8", fontSize: "0.875rem" }}>No sources found.</p>
      )}
      {sources.length > 0 && (
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.8125rem" }}>
          <thead>
            <tr style={{ borderBottom: "1px solid #1e293b", textAlign: "left" }}>
              <th style={{ padding: "0.5rem", color: "#94a3b8", fontWeight: 600 }}>Name</th>
              <th style={{ padding: "0.5rem", color: "#94a3b8", fontWeight: 600 }}>MIME Type</th>
              <th style={{ padding: "0.5rem", color: "#94a3b8", fontWeight: 600 }}>Version Status</th>
              <th style={{ padding: "0.5rem", color: "#94a3b8", fontWeight: 600 }}>Source ID</th>
            </tr>
          </thead>
          <tbody>
            {sources.map((s) => (
              <tr key={s.id} style={{ borderBottom: "1px solid #14182a" }}>
                <td style={{ padding: "0.5rem", color: "#e2e8f0" }}>{s.name}</td>
                <td style={{ padding: "0.5rem", color: "#94a3b8" }}>{s.mimeType}</td>
                <td style={{ padding: "0.5rem", color: "#94a3b8" }}>
                  {s.latestVersion?.status ?? "—"}
                </td>
                <td style={{ padding: "0.5rem", color: "#94a3b8", fontFamily: "monospace" }}>{s.id}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
