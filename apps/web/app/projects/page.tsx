"use client";

import { useEffect, useState } from "react";
import { apiGet, ApiError } from "../lib/api";

interface ProjectRow {
  id: string;
  name: string;
  tenantId: string;
  createdAt: string;
}

export default function ProjectsPage() {
  const [projects, setProjects] = useState<ProjectRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await apiGet<ProjectRow[]>("/projects");
        if (!cancelled) setProjects(data);
      } catch (err: unknown) {
        if (!cancelled) {
          setError(err instanceof ApiError ? err.message : "Failed to load projects.");
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
        Projects
      </h1>
      {loading && <p style={{ color: "#94a3b8", fontSize: "0.875rem" }}>Loading projects…</p>}
      {error && (
        <p style={{ color: "#f87171", fontSize: "0.875rem", margin: 0 }}>
          Error: {error}
        </p>
      )}
      {!loading && !error && projects.length === 0 && (
        <p style={{ color: "#94a3b8", fontSize: "0.875rem" }}>No projects found.</p>
      )}
      {projects.length > 0 && (
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.8125rem" }}>
          <thead>
            <tr style={{ borderBottom: "1px solid #1e293b", textAlign: "left" }}>
              <th style={{ padding: "0.5rem", color: "#94a3b8", fontWeight: 600 }}>Name</th>
              <th style={{ padding: "0.5rem", color: "#94a3b8", fontWeight: 600 }}>Project ID</th>
              <th style={{ padding: "0.5rem", color: "#94a3b8", fontWeight: 600 }}>Created</th>
            </tr>
          </thead>
          <tbody>
            {projects.map((p) => (
              <tr key={p.id} style={{ borderBottom: "1px solid #14182a" }}>
                <td style={{ padding: "0.5rem", color: "#e2e8f0" }}>{p.name}</td>
                <td style={{ padding: "0.5rem", color: "#94a3b8", fontFamily: "monospace" }}>{p.id}</td>
                <td style={{ padding: "0.5rem", color: "#94a3b8" }}>{p.createdAt}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
