"use client";

import { useEffect, useState } from "react";
import { api, type CollectionHealth } from "@/lib/api";

export default function AdminOverviewPage() {
  const [health, setHealth] = useState<CollectionHealth[]>([]);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    api<CollectionHealth[]>("/v1/health/collection")
      .then(setHealth)
      .catch((e) => setErr(String(e)));
  }, []);

  const totalOk = health.reduce((s, r) => s + r.quotes_ok, 0);
  const totalBlocked = health.reduce((s, r) => s + r.quotes_blocked, 0);
  const totalMissing = health.reduce((s, r) => s + r.quotes_missing, 0);

  return (
    <>
      <h1 className="fade-in">Admin Overview</h1>
      <p className="sub fade-in fade-in-delay-1">
        Collection health summary across all data sources.
      </p>
      {err && <p className="err">{err}</p>}

      <div className="stat-row fade-in fade-in-delay-1">
        <div className="stat-card">
          <div className="stat-label">Sources</div>
          <div className="stat-value">{health.length}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Quotes OK</div>
          <div className="stat-value" style={{ color: "var(--accent-green)" }}>
            {totalOk}
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Missing</div>
          <div className="stat-value" style={{ color: "var(--accent-gold)" }}>
            {totalMissing}
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Blocked</div>
          <div className="stat-value" style={{ color: "var(--accent-red)" }}>
            {totalBlocked}
          </div>
        </div>
      </div>

      <div className="panel fade-in fade-in-delay-2">
        <h2>Collection Sources</h2>
        <table>
          <thead>
            <tr>
              <th>Source</th>
              <th>Status</th>
              <th>OK</th>
              <th>Missing</th>
              <th>Blocked</th>
              <th>Last Run</th>
            </tr>
          </thead>
          <tbody>
            {health.map((r) => (
              <tr key={r.source}>
                <td style={{ fontWeight: 600 }}>{r.source}</td>
                <td>
                  <span
                    className={`badge ${r.status === "done" ? "badge-ok" : r.status === "running" ? "badge-warn" : "badge-err"}`}
                  >
                    {r.status}
                  </span>
                </td>
                <td>{r.quotes_ok}</td>
                <td>{r.quotes_missing}</td>
                <td>{r.quotes_blocked}</td>
                <td style={{ color: "var(--text-muted)", fontSize: 13 }}>
                  {r.last_finished_at || r.last_started_at || "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
