"use client";

import { useCallback, useEffect, useState } from "react";
import { api, apiPost, type AdapterHealth, type CollectionSummary } from "@/lib/api";

export default function ScrapePage() {
  const [health, setHealth] = useState<CollectionSummary | null>(null);
  const [adapters, setAdapters] = useState<AdapterHealth[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [demo, setDemo] = useState(false);
  const load = useCallback(async () => {
    try {
      const [summary, registry] = await Promise.all([
        api<CollectionSummary>("/v1/health/collection"),
        api<{ sources: AdapterHealth[] }>("/v1/collect/sources"),
      ]);
      setHealth(summary);
      setAdapters(registry.sources);
    } catch (error) { setErr(String(error)); }
  }, []);

  useEffect(() => {
    void load();
    const timer = setInterval(() => void load(), 15000);
    return () => clearInterval(timer);
  }, [load]);

  async function runSnapshot() {
    setBusy(true); setErr(null); setMsg(null);
    try {
      const result = await apiPost<{ job_id: string }>("/v1/collect/run", { full: true, demo });
      setMsg(`Snapshot queued: ${result.job_id}. The collection worker will process the complete basket.`);
      await load();
    } catch (error) { setErr(String(error)); }
    finally { setBusy(false); }
  }

  async function toggle(adapter: AdapterHealth) {
    setBusy(true); setErr(null);
    try {
      await apiPost("/v1/collect/sources", { id: adapter.id, enabled: !adapter.enabled });
      await load();
    } catch (error) { setErr(String(error)); }
    finally { setBusy(false); }
  }

  const progress = health?.progress || {};
  const completed = ["done", "missing", "sold_out", "blocked", "blocked_robots", "error"].reduce((n, key) => n + (progress[key] || 0), 0);
  const total = Object.values(progress).reduce((n, v) => n + v, 0);
  return (
    <>
      <h1>Basket collection</h1>
      <p className="sub" style={{ maxWidth: 720 }}>
        One economy, one-way fare per basket route and lead-time bin, at 06:00 and 18:00 IST.
        Disallowed searches and challenges close that host for the slot. Fill gaps through <a href="/admin/ingest">operator ingest</a>.
      </p>
      {err && <p className="err" role="alert">{err}</p>}
      {msg && <p className="sub" role="status">{msg}</p>}

      <section className="panel" aria-labelledby="snapshot-heading">
        <h2 id="snapshot-heading">Snapshot control</h2>
        <p className="sub">
          Live HTTP: <strong>{health?.scrape_enabled ? "enabled" : "off"}</strong>. Offline sources remain available.
          Jobs run through <code>npm run collect:worker</code>.
        </p>
        <label style={{ display: "flex", alignItems: "center", gap: 8, margin: "16px 0" }}>
          <input type="checkbox" checked={demo} onChange={(e) => setDemo(e.target.checked)} />
          Include synthetic demo fares (requires SYNTHETIC_DEMO_ENABLED=true; synthetic fares never enter an official vintage)
        </label>
        <button className="primary" type="button" disabled={busy} onClick={() => void runSnapshot()}>
          {busy ? "Working…" : "Run snapshot now"}
        </button>
        {health?.job && <p className="sub" style={{ marginTop: 16 }}>Job {health.job.id}: {health.job.status}{health.job.error ? ` — ${health.job.error}` : ""}</p>}
      </section>

      <section className="panel" aria-labelledby="coverage-heading">
        <h2 id="coverage-heading">Last snapshot</h2>
        <p className="sub">{health?.last_snapshot_at ? new Date(health.last_snapshot_at).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" }) + " IST" : "No snapshot yet"} ({health?.snapshot_slot || "—"})</p>
        <dl style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 20, margin: "20px 0" }}>
          <div><dt>Observed route coverage</dt><dd style={{ fontSize: 28, fontWeight: 600 }}>{((health?.coverage || 0) * 100).toFixed(1)}%</dd></div>
          <div><dt>Observed cells</dt><dd>{health?.observed_cells || 0} / {health?.cells || 0}</dd></div>
          <div><dt>Vintage / quality</dt><dd>{health?.vintage || "provisional"} / {health?.quality || "low"}</dd></div>
          <div><dt>Unpriced gaps</dt><dd>{health?.unavailable_cells || 0}</dd></div>
        </dl>
        <p className="sub">Target: 80% observed routes. Below 60% stays provisional with low quality. Imputed and synthetic fares do not count as observations.</p>
        <p className="sub">Blocked sources: {health?.blocked_sources.join(", ") || "none recorded"}</p>
        <a href="/admin/ingest">Complete missing cells with CSV / JSON</a>
      </section>

      <section className="panel" aria-labelledby="progress-heading">
        <h2 id="progress-heading">Worklist progress</h2>
        <progress value={completed} max={total || 1} aria-label="Completed collection cells" style={{ width: "100%" }} />
        <p className="sub">{completed} / {total} source-cell jobs completed</p>
        <p>OK {progress.done || 0} · Missing {progress.missing || 0} · Sold out {progress.sold_out || 0} · Blocked {progress.blocked || 0} · Robots denied {progress.blocked_robots || 0} · Errors {progress.error || 0}</p>
      </section>

      <section className="panel" aria-labelledby="adapters-heading" style={{ overflowX: "auto" }}>
        <h2 id="adapters-heading">Source adapters</h2>
        <table>
          <thead><tr><th scope="col">Source</th><th scope="col">Priority</th><th scope="col">Robots / host gate</th><th scope="col">Collection</th></tr></thead>
          <tbody>{adapters.map((a) => (
            <tr key={a.id}>
              <td><strong>{a.id}</strong><br /><small>{a.host || a.kind}</small>{a.skipped_reason && <p className="sub">{a.skipped_reason}</p>}</td>
              <td>{a.source_rank}</td>
              <td>{a.robots.verdict.replace(/_/g, " ")}<br /><small>{a.robots.notes}</small>{a.robots.checked_at && <p className="sub">Checked {new Date(a.robots.checked_at).toLocaleTimeString()}</p>}</td>
              <td><button type="button" disabled={busy || a.kind === "skip"} onClick={() => void toggle(a)} aria-label={`${a.enabled ? "Disable" : "Enable"} ${a.id}`}>{a.enabled ? "Disable" : "Enable"}</button><br /><small>{a.kind === "skip" ? "Skipped by policy" : a.robots.verdict === "blocked" ? "Closed for this slot" : a.runnable ? "Available" : "Environment gate closed"}</small></td>
            </tr>
          ))}</tbody>
        </table>
      </section>
    </>
  );
}
