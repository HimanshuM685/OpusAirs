"use client";

import { useEffect, useState } from "react";
import { api, type CollectionHealth } from "@/lib/api";

export default function ScrapePage() {
  const [rows, setRows] = useState<CollectionHealth[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  function load() {
    api<CollectionHealth[]>("/v1/health/collection")
      .then(setRows)
      .catch((e) => setErr(String(e)));
  }

  useEffect(() => {
    load();
  }, []);

  async function runScrape() {
    setMsg("Running collect against live airline portals…");
    const res = await fetch(`/v1/collect/run?scrape=true`, {
      method: "POST",
    });
    setMsg(res.ok ? JSON.stringify(await res.json()) : `Failed ${res.status}`);
    load();
  }

  return (
    <>
      <h1 className="fade-in">Scrape &amp; Collection Health</h1>
      <p className="sub fade-in fade-in-delay-1">
        Live portal scrape checks robots.txt, rate-limits, and records{" "}
        <code>blocked</code> on CAPTCHA. It does not rotate IPs or solve
        challenges. If a source blocks, feed the same schema on{" "}
        <a href="/admin/ingest" style={{ color: "var(--accent-blue)" }}>
          Data Dump
        </a>
        .
      </p>
      {err && <p className="err">{err}</p>}
      <p className="fade-in fade-in-delay-1">
        <button
          className="primary"
          onClick={() => void runScrape()}
          type="button"
        >
          🕷️ Scrape airline portals
        </button>
      </p>
      {msg && <p className="sub">{msg}</p>}
      <div className="panel fade-in fade-in-delay-2">
        <table>
          <thead>
            <tr>
              <th>Source</th>
              <th>Status</th>
              <th>OK</th>
              <th>Missing</th>
              <th>Sold out</th>
              <th>Blocked</th>
              <th>Last run</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
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
                <td>{r.quotes_sold_out}</td>
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
