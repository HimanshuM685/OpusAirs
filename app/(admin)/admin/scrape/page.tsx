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
  const [jobs, setJobs] = useState<Record<string, number> | null>(null);

  const [latestJob, setLatestJob] = useState<{ id: string; type: string; status: string } | null>(null);

  function load() {
    api<CollectionHealth[]>("/v1/health/collection")
      .then(setRows)
      .catch((e) => setErr(String(e)));
    api<Record<string, number>>("/v1/collect/jobs")
      .then(setJobs)
      .catch(() => setJobs(null));
    api<{ id: string; type: string; status: string }[]>("/v1/jobs")
      .then((list) => setLatestJob(list[0] ?? null))
      .catch(() => setLatestJob(null));
  }

  useEffect(() => {
    load();
    const timer = setInterval(load, 15000);
    return () => clearInterval(timer);
  }, []);

  async function runScrape(body: { origin?: string; dest?: string; full?: boolean } = {}) {
    setBusy(true);
    setErr(null);
    setMsg(body.full ? "Starting India collect in the background…" : "Running collect against live airline portals…");
    const res = await fetch(`/v1/collect/run?scrape=true`, {
      method: "POST",
      credentials: "include",
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
        <h2 style={{ marginTop: 0, fontSize: 18 }}>India collect</h2>
        <p className="sub">
          Queues the PSD basket first, then discovered Indian pairs. One-way and round-trip,
          T+1, T+7, T+14, T+21, and T+30. Every flight card on an allowed page is stored.
          The first robots.txt disallow or challenge closes that source for the day. Remaining
          jobs are marked blocked with no further fetch. Disallowed portals are not forced open.
          A second start exits if one collect is already running.
        </p>
        <button className="primary" type="button" disabled={busy} onClick={() => void runScrape({ full: true })}>
          Start India collect
        </button>
        {latestJob && (
          <p className="sub" style={{ marginTop: 12 }}>
            Latest job {latestJob.type}: {latestJob.status} ({latestJob.id})
          </p>
        )}
        <p className="sub" style={{ marginTop: 12 }}>
          Daily cron: <code>15 2 * * * cd /path/to/OpusAirs && npm run collect:daily</code>
        </p>
      </div>

      <div className="panel fade-in fade-in-delay-1">
        <h2 style={{ marginTop: 0, fontSize: 18 }}>Basket sample</h2>
        <p className="sub">Claims up to 80 pending jobs in this request. The India collect button is the long run.</p>
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
      {jobs && (
        <div className="panel fade-in">
          <h2 style={{ marginTop: 0, fontSize: 18 }}>Today&apos;s queue</h2>
          <p className="sub">
            pending {jobs.pending ?? 0} · running {jobs.running ?? 0} · done {jobs.done ?? 0} · missing{" "}
            {jobs.missing ?? 0} · blocked {jobs.blocked ?? 0} · failed {jobs.failed ?? 0} · routes ok{" "}
            {jobs.routes_ok ?? 0}/{jobs.routes ?? 0}
          </p>
        </div>
      )}
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
