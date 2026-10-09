"use client";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { apiPost } from "@/lib/api";
import { useUrlState } from "@/lib/use-url-state";
import { DEFAULT_SETTINGS, istInputValue, parseIstInput, type CollectionSettings } from "@/lib/collect/contracts";
import { ResourceState } from "@/components/resource-state";
import { PageHeading } from "@/components/page-heading";
import { NextRun, RunProgress, WorkerStatus, timeIST, useCollectionMonitor } from "@/components/collection-status";

export default function ScrapePage() {
  const { params } = useUrlState();
  const monitor = useCollectionMonitor(params.get("job") || undefined);
  const data = monitor.data;
  const [settings, setSettings] = useState<CollectionSettings>(DEFAULT_SETTINGS);
  const initialized = useRef(false);
  useEffect(() => { if (data && !initialized.current) { setSettings(data.settings); initialized.current = true; } }, [data]);
  const [at, setAt] = useState("");
  useEffect(() => setAt(istInputValue(new Date(Date.now() + 300000))), []);
  const [recurrence, setRecurrence] = useState("once");
  const [busy, setBusy] = useState<string | null>(null);
  const lock = useRef(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<Error | null>(null);
  async function action(name: string, task: () => Promise<void>) {
    if (lock.current) return; lock.current = true; setBusy(name); setError(null); setMessage(null);
    try { await task(); monitor.refresh(); } catch (err) { setError(err instanceof Error ? err : new Error(String(err))); }
    finally { lock.current = false; setBusy(null); }
  }
  // Run now uses the form settings for this run only; defaults change only via "Save as defaults".
  const run = () => action("run", async () => {
    const result = await apiPost<{ job_id: string; existing: boolean }>("/v1/collect/run", { transportMode: settings.transport_mode, settings });
    setMessage(result.existing ? "A run is already active; showing it." : "Run queued. Your connected worker starts it within a few seconds.");
  });
  const schedule = (event: FormEvent) => { event.preventDefault(); void action("schedule", async () => {
    const date = parseIstInput(at);
    await apiPost("/v1/collect/control", { action: "schedule", run_at: date, transport_mode: settings.transport_mode, recurrence });
    setMessage(`Run scheduled for ${timeIST(date)}.`);
  }); };
  const job = data?.job;
  const active = data?.jobs.find((j) => ["running", "queued"].includes(j.status));
  const scheduled = data?.schedules.filter((s) => s.status === "scheduled").sort((a, b) => a.run_at.localeCompare(b.run_at)) || [];
  const airlines = data?.adapters.filter((a) => a.host) || [];
  return <>
    <PageHeading title="Collection">Tinyfish scrapes airline fares through your connected worker. Start now or schedule a time (IST).</PageHeading>
    <div className="monitor-sync" aria-live="polite"><span>{monitor.error ? "Connection interrupted · showing last saved state" : monitor.updatedAt ? `Updated ${new Date(monitor.updatedAt).toLocaleTimeString()}` : "Connecting…"}</span><button type="button" onClick={monitor.refresh} disabled={monitor.loading}>Refresh</button></div>
    <ResourceState loading={monitor.loading} error={monitor.error} retry={monitor.refresh} label="collection monitor" />
    <ResourceState error={error} />{message && <p className="quality-note" role="status">{message}</p>}

    {data && <><WorkerStatus data={data} /><RunProgress data={data} />
      {job && <div className="toolbar run-actions">
        {["queued", "running"].includes(job.status) && <button type="button" disabled={!!busy || job.cancel_requested} onClick={() => void action("cancel", async () => { await apiPost("/v1/collect/control", { action: "cancel", job_id: job.id }); setMessage("Stop requested. Remote sessions close before the worker stops."); })}>{job.cancel_requested ? "Stop requested" : "Stop run"}</button>}
        {job.status === "error" && <button type="button" disabled={!!busy || !!active} onClick={() => void action("retry", async () => { await apiPost("/v1/collect/control", { action: "retry", job_id: job.id }); })}>Retry</button>}
      </div>}
    </>}

    <section className="panel"><h2>Start scraping</h2>
      <div className="toolbar"><button className="primary" type="button" disabled={!!busy || !data || !!active} onClick={() => void run()}>{busy === "run" ? "Queueing…" : active ? "Run in progress" : "Run now"}</button></div>
      <form className="schedule-form" onSubmit={schedule}><label>Or schedule · IST<input type="datetime-local" value={at} onChange={(e) => setAt(e.target.value)} required /></label><label>Repeat<select value={recurrence} onChange={(e) => setRecurrence(e.target.value)}><option value="once">Once</option><option value="daily">Daily</option></select></label><button type="submit" disabled={!!busy || !data}>{busy === "schedule" ? "Scheduling…" : "Schedule"}</button></form>
      {scheduled.length > 0 && <><p><NextRun at={scheduled[0].run_at} /></p><ul className="worker-events">{scheduled.map((s) => <li key={s.id}><time>{timeIST(s.run_at)}</time><strong>{s.recurrence}</strong><span>{s.transport_mode}</span><button type="button" disabled={!!busy} onClick={() => void action("cancel_schedule", async () => { await apiPost("/v1/collect/control", { action: "cancel_schedule", schedule_id: s.id }); })}>Cancel</button></li>)}</ul></>}
      <details><summary>Advanced</summary>
        <div className="collection-control-grid">
          <label>Scraper<select value={settings.transport_mode} onChange={(e) => setSettings({ ...settings, transport_mode: e.target.value as CollectionSettings["transport_mode"] })}><option value="tinyfish">Tinyfish (recommended)</option><option value="http">Plain HTTP (optional)</option><option value="offline">Offline observations only</option></select></label>
          {settings.transport_mode === "tinyfish" && <><label>Browser sessions<input type="number" min={1} max={5} value={settings.max_sessions} onChange={(e) => setSettings({ ...settings, max_sessions: Number(e.target.value) })} /></label>
            <label>Agent runs<input type="number" min={0} max={5} value={settings.max_agent_runs} onChange={(e) => setSettings({ ...settings, max_agent_runs: Number(e.target.value) })} /></label></>}
          <label>Maximum hours<input type="number" min={0.05} max={3} step={0.05} value={settings.max_hours} onChange={(e) => setSettings({ ...settings, max_hours: Number(e.target.value) })} /></label>
        </div>
        <p className="sub">Run now uses these values. Scheduled runs use saved defaults.</p>
        <button type="button" disabled={!!busy || !data} onClick={() => void action("save", async () => { await apiPost("/v1/collect/control", { action: "settings", ...settings }); setMessage("Defaults saved."); })}>{busy === "save" ? "Saving…" : "Save as defaults"}</button>
      </details>
    </section>

    {data && <><section className="panel"><h2>Airlines</h2>
        <div className="table-scroll" tabIndex={0}><table><thead><tr><th>Scrape</th><th>Airline</th><th>Processed</th><th>Phase</th><th>Quotes</th><th>Issue</th></tr></thead><tbody>{airlines.map((adapter) => {
          const source = data.sources.find((s) => s.source === adapter.id), usage = data.budget?.airlines[adapter.id];
          return <tr key={adapter.id}><td><input type="checkbox" aria-label={`Scrape ${adapter.id}`} checked={adapter.enabled && adapter.kind !== "skip"} disabled={!!busy || adapter.kind === "skip"} onChange={() => void action("source", async () => { await apiPost("/v1/collect/sources", { id: adapter.id, enabled: !adapter.enabled }); })} /></td>
            <td><strong>{adapter.id}</strong><small className="job-id">{adapter.host}</small></td><td>{source ? `${source.completed} / ${source.total}` : "—"}</td><td>{usage?.phase?.replaceAll("_", " ") || usage?.path || (adapter.kind === "skip" ? "Skipped" : "—")}</td><td>{usage?.quotes_parsed ?? "—"}</td><td>{usage?.blocked_reason || usage?.error || adapter.skipped_reason || (source?.counts.missing ? `${source.counts.missing} missing` : "—")}</td></tr>;
        })}</tbody></table></div>
        {data.budget?.notes && <p className="err" role="alert">{data.budget.notes}</p>}
      </section>

      <section className="panel"><h2>Activity</h2>
        {!data.events.length ? <p>No events yet.</p> : <ol className="worker-events">{data.events.map((event) => <li key={event.id}><time>{new Date(event.created_at).toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour12: false })} IST</time><strong>{event.source || event.event.replaceAll("_", " ")}</strong><span>{event.message}</span></li>)}</ol>}
      </section>
    </>}
  </>;
}
