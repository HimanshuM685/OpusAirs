"use client";

import { useEffect, useState } from "react";
import { api, type CollectionHealth } from "@/lib/api";

export default function ScrapePage() {
  const [rows, setRows] = useState<CollectionHealth[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [origin, setOrigin] = useState("CCU");
  const [dest, setDest] = useState("BOM");
  const [busy, setBusy] = useState(false);

  function load() {
    api<CollectionHealth[]>("/v1/health/collection")
      .then(setRows)
      .catch((e) => setErr(String(e)));
  }

  useEffect(() => {
    load();
  }, []);

  async function runScrape(body: { origin?: string; dest?: string } = {}) {
    setBusy(true);
    setErr(null);
    setMsg("Running collect against live airline portals…");
    const res = await fetch(`/v1/collect/run?scrape=true`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const text = await res.text();
    setMsg(res.ok ? text : `Failed ${res.status} ${text}`);
    load();
    setBusy(false);
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

      <div className="panel fade-in fade-in-delay-1">
        <h2 style={{ marginTop: 0, fontSize: 18 }}>Top basket routes</h2>
        <p className="sub">PSD city-pairs including CCU–BOM. Budget 80 searches, rate-limited.</p>
        <button
          className="primary"
          onClick={() => void runScrape()}
          type="button"
          disabled={busy}
        >
          Scrape top routes
        </button>
      </div>

      <div className="panel fade-in fade-in-delay-1">
        <h2 style={{ marginTop: 0, fontSize: 18 }}>Any route</h2>
        <p className="sub">3-letter IATA. Scrapes only this pair.</p>
        <div className="row" style={{ display: "flex", gap: 12, alignItems: "end", flexWrap: "wrap" }}>
          <div className="field">
            <label htmlFor="scrape-origin">Origin</label>
            <input
              id="scrape-origin"
              value={origin}
              maxLength={3}
              onChange={(e) => setOrigin(e.target.value.toUpperCase())}
            />
          </div>
          <div className="field">
            <label htmlFor="scrape-dest">Destination</label>
            <input
              id="scrape-dest"
              value={dest}
              maxLength={3}
              onChange={(e) => setDest(e.target.value.toUpperCase())}
            />
          </div>
          <button
            className="primary"
            type="button"
            disabled={busy || origin.length !== 3 || dest.length !== 3}
            onClick={() => void runScrape({ origin, dest })}
          >
            Scrape this route
          </button>
        </div>
      </div>

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
