"use client";

import { useState } from "react";
import Link from "next/link";
import { apiPost, type AdapterHealth, type CollectionSummary } from "@/lib/api";
import { useResource } from "@/lib/use-resource";
import { ResourceState } from "@/components/resource-state";

export default function ScrapePage() {
  const summary = useResource<CollectionSummary>("/v1/health/collection", { pollMs: 15000, ttlMs: 10000 });
  const registry = useResource<{ sources: AdapterHealth[] }>("/v1/collect/sources", { ttlMs: 30000 });
  const health = summary.data;
  const adapters = registry.data?.sources || [];
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [demo, setDemo] = useState(false);
  const load = () => { summary.refresh(); registry.refresh(); };

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
        One economy, one-way fare per basket route and lead-time bin, at 06:00 IST (18:00 only when configured).
        Disallowed searches and challenges close that host for the slot. Fill gaps through <Link className="text-link" href="/admin/ingest">operator ingest</Link>.
      </p>
      {err && <p className="err" role="alert">{err}</p>}
      {msg && <p className="sub" role="status">{msg}</p>}
      <ResourceState {...summary} retry={summary.refresh} label="collection status" />
      <ResourceState {...registry} retry={registry.refresh} label="adapters" />

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
        <button className="primary" type="button" disabled={busy || !health || ["queued", "running"].includes(health.job?.status || "")} onClick={() => void runSnapshot()}>
          {busy ? "Working…" : "Run snapshot now"}
        </button>
        {health?.job && <p className="sub" style={{ marginTop: 16 }}>Job {health.job.id}: {health.job.status}{health.job.error ? ` — ${health.job.error}` : ""}</p>}
      </section>

      <section className="panel" aria-labelledby="transport-heading" style={{ overflowX: "auto" }}>
        <h2 id="transport-heading">Airline transport budget</h2>
        <p className="sub">Tinyfish {health?.tinyfish_enabled ? "enabled" : "off"}{health?.tinyfish_disabled ? " — disabled for this run" : ""}.
          Sessions {health?.sessions_opened || 0}/{health?.max_sessions ?? 5}; deleted {health?.sessions_deleted || 0}.
          Agent runs {health?.agent_runs || 0}/{health?.max_agent_runs ?? 5}.</p>
        {health?.budget_notes && <p className="err" role="status">{health.budget_notes}</p>}
        <table>
          <thead><tr><th scope="col">Airline</th><th scope="col">Path used</th><th scope="col">Session</th><th scope="col">Quotes parsed</th><th scope="col">Block / error</th></tr></thead>
          <tbody>{Object.entries(health?.airlines || {}).map(([id, a]) => <tr key={id}>
            <td>{id}</td><td><span className={`badge ${a.path === "skipped" ? "badge-err" : "badge-ok"}`}>{a.path || "skipped"}</span></td>
            <td>{a.session_id || "—"}{a.session_id && <small> ({a.session_deleted ? "deleted" : "open / cleanup pending"})</small>}</td>
            <td>{a.quotes_parsed || 0}</td><td>{a.blocked_reason || a.error || "—"}</td>
          </tr>)}</tbody>
        </table>
      </section>

      <section className="panel" aria-labelledby="coverage-heading">
        <h2 id="coverage-heading">Last snapshot</h2>
        <p className="sub">{health?.last_snapshot_at ? new Date(health.last_snapshot_at).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" }) + " IST" : "No snapshot yet"} ({health?.snapshot_slot || "—"})</p>
        <dl style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 20, margin: "20px 0" }}>
          <div><dt>Weighted observed cells</dt><dd style={{ fontSize: 28, fontWeight: 600 }}>{((health?.coverage || 0) * 100).toFixed(1)}%</dd></div>
          <div><dt>Observed cells</dt><dd>{health?.observed_cells || 0} / {health?.cells || 0}</dd></div>
          <div><dt>Vintage / quality</dt><dd>{health?.vintage || "provisional"} / {health?.quality || "low"}</dd></div>
          <div><dt>Unpriced gaps</dt><dd>{health?.unavailable_cells || 0}</dd></div>
        </dl>
        <p className="sub">Target: 80% weighted basket cells observed. Below 60% stays provisional with low quality. Imputed and synthetic fares do not count as observations.</p>
        <p className="sub">Blocked sources: {health?.blocked_sources.join(", ") || "none recorded"}</p>
        <Link className="text-link" href="/admin/ingest">Complete missing cells with CSV / JSON</Link>
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
