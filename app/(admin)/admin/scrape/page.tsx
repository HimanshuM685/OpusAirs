"use client";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { apiPost } from "@/lib/api";
import { useUrlState } from "@/lib/use-url-state";
import { istInputValue, parseIstInput, type CollectionSettings } from "@/lib/collect/contracts";
import { ResourceState } from "@/components/resource-state";
import { PageHeading } from "@/components/page-heading";
import { NextRun, RunProgress, WorkerStatus, jobLabel, timeIST, useCollectionMonitor } from "@/components/collection-status";

export default function ScrapePage() {
  const { params, update } = useUrlState();
  const monitor = useCollectionMonitor(params.get("job") || undefined);
  const data = monitor.data;
  const [settings, setSettings] = useState<CollectionSettings>({ transport_mode: "tinyfish", max_sessions: 5, max_agent_runs: 5, max_hours: 3 });
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
  const saveSettings = () => apiPost("/v1/collect/control", { action: "settings", ...settings });
  const run = () => action("run", async () => {
    await saveSettings();
    const result = await apiPost<{ job_id: string; existing: boolean }>("/v1/collect/run", { transportMode: settings.transport_mode });
    update({ job: result.job_id }); setMessage(result.existing ? "Showing the existing active run." : "Run queued. Your connected contributor will start it.");
  });
  const schedule = (event: FormEvent) => { event.preventDefault(); void action("schedule", async () => {
    const date = parseIstInput(at); await saveSettings();
    await apiPost("/v1/collect/control", { action: "schedule", run_at: date, transport_mode: settings.transport_mode, recurrence });
    setMessage(`Run scheduled for ${timeIST(date)}.`);
  }); };
  const active = data?.jobs.find((job) => ["running", "queued"].includes(job.status));
  const next = data?.schedules.filter((s) => s.status === "scheduled").sort((a, b) => a.run_at.localeCompare(b.run_at))[0];
  return <>
    <PageHeading title="Collection control">Schedule Tinyfish collection, connect your laptop contributor, and follow saved progress from start to cleanup. All scheduling uses IST.</PageHeading>
    <div className="monitor-sync" aria-live="polite"><span>{monitor.error ? "Connection interrupted · showing last saved state" : monitor.refreshing ? "Syncing saved progress…" : monitor.updatedAt ? `Updated ${new Date(monitor.updatedAt).toLocaleTimeString()}` : "Connecting to collection ledger…"}</span><button type="button" onClick={monitor.refresh} disabled={monitor.loading}>Refresh</button></div>
    <ResourceState loading={monitor.loading} error={monitor.error} retry={monitor.refresh} label="collection monitor" />
    <ResourceState error={error} />{message && <p className="quality-note" role="status">{message}</p>}
    {data && <><WorkerStatus data={data} /><RunProgress data={data} />
      <div className="toolbar run-actions">
        {data.job && ["queued", "running"].includes(data.job.status) && <button type="button" disabled={!!busy || data.job.cancel_requested} onClick={() => void action("cancel", async () => { await apiPost("/v1/collect/control", { action: "cancel", job_id: data.job!.id }); setMessage("Stop requested. Remote sessions are closed before the worker stops."); })}>{data.job.cancel_requested ? "Stop requested" : "Stop this run"}</button>}
        {data.job && ["error", "cancelled"].includes(data.job.status) && <button type="button" disabled={!!busy || !!active} onClick={() => void action("retry", async () => { const result = await apiPost<{ job_id: string }>("/v1/collect/control", { action: "retry", job_id: data.job!.id }); update({ job: result.job_id }); })}>Retry with saved settings</button>}
        <label>Inspect run<select value={data.job?.id || ""} onChange={(e) => update({ job: e.target.value })}>{data.jobs.map((job) => <option key={job.id} value={job.id}>{jobLabel(job.status)} · {timeIST(job.created_at)} · {job.id.slice(0, 8)}</option>)}</select></label>
        {params.get("job") && <button type="button" onClick={() => update({ job: null })}>Follow active run</button>}
      </div>
    </>}

    <section className="panel"><h2>Plan a collection</h2><p className="sub">Tinyfish is the default. HTTP and offline are explicit modes; provider failures never silently switch transport.</p>
      <div className="collection-control-grid">
        <label>Transport<select value={settings.transport_mode} onChange={(e) => setSettings({ ...settings, transport_mode: e.target.value as CollectionSettings["transport_mode"] })}><option value="tinyfish">Tinyfish Browser + Agent</option><option value="http">HTTP only</option><option value="offline">Offline observations only</option></select></label>
        <label>Browser sessions per run<input type="number" min={1} max={5} value={settings.max_sessions} onChange={(e) => setSettings({ ...settings, max_sessions: Number(e.target.value) })} /></label>
        <label>Agent runs per run<input type="number" min={0} max={5} value={settings.max_agent_runs} onChange={(e) => setSettings({ ...settings, max_agent_runs: Number(e.target.value) })} /></label>
        <label>Maximum hours<input type="number" min={0.05} max={3} step={0.05} value={settings.max_hours} onChange={(e) => setSettings({ ...settings, max_hours: Number(e.target.value) })} /></label>
      </div>
      <div className="toolbar"><button type="button" disabled={!!busy || !data} onClick={() => void action("save", async () => { await saveSettings(); setMessage("Collection defaults saved."); })}>{busy === "save" ? "Saving…" : "Save defaults"}</button>
        <button className="primary" type="button" disabled={!!busy || !data || !!active} onClick={() => void run()}>{busy === "run" ? "Queueing…" : active ? "Collection already active" : "Run now"}</button></div>
      <form className="schedule-form" onSubmit={schedule}><label>Start date and time · IST<input type="datetime-local" value={at} onChange={(e) => setAt(e.target.value)} required /></label><label>Repeat<select value={recurrence} onChange={(e) => setRecurrence(e.target.value)}><option value="once">Once</option><option value="daily">Daily at this time</option></select></label><button type="submit" disabled={!!busy || !data}>{busy === "schedule" ? "Scheduling…" : "Schedule run"}</button></form>
      <p className="sub">Your contributor must be online at the scheduled time. Same-day delayed runs wait for an available worker; missed past dates are never presented as newly scraped observations.</p>
    </section>

    {data && <><section className="panel"><h2>Scheduled starts</h2><p><NextRun at={next?.run_at} /></p>
      <div className="table-scroll" tabIndex={0}><table><thead><tr><th>Next start · IST</th><th>Repeat</th><th>Transport</th><th>State</th><th>Action</th></tr></thead><tbody>{data.schedules.map((s) => <tr key={s.id}><td>{timeIST(s.run_at)}</td><td>{s.recurrence}</td><td>{s.transport_mode}</td><td>{s.status}</td><td>{s.status === "scheduled" && <button disabled={!!busy} onClick={() => void action("cancel_schedule", async () => { await apiPost("/v1/collect/control", { action: "cancel_schedule", schedule_id: s.id }); })}>Cancel schedule</button>}</td></tr>)}</tbody></table></div></section>

      <section className="panel"><h2>Airlines and source progress</h2><p className="sub">Robots checks, provider sessions, extracted quotes, and failure reasons are reported by the worker.</p>
        <div className="table-scroll" tabIndex={0}><table><thead><tr><th>Source</th><th>Processed</th><th>Transport / phase</th><th>Quotes</th><th>Result / issue</th></tr></thead><tbody>{data.adapters.map((adapter) => {
          const source = data.sources.find((s) => s.source === adapter.id), usage = data.budget?.airlines[adapter.id];
          return <tr key={adapter.id}><td><strong>{adapter.id}</strong><small className="job-id">{adapter.host || "Offline"}</small></td><td>{source ? `${source.completed} / ${source.total}` : "—"}{source && <progress value={source.completed} max={source.total || 1} aria-label={`${adapter.id} cells processed`} />}</td><td>{usage?.path || (adapter.kind === "skip" ? "Skipped" : "Waiting")}<small className="job-id">{usage?.phase?.replaceAll("_", " ")}{usage?.current_cell && ` · ${usage.current_cell}`}</small></td><td>{usage?.quotes_parsed ?? "—"}</td><td>{usage?.blocked_reason || usage?.error || adapter.skipped_reason || (source?.counts.missing ? `${source.counts.missing} missing` : "—")}</td></tr>;
        })}</tbody></table></div>
        <p className="sub">Browser sessions: {data.budget?.sessions_opened || 0} opened / {data.budget?.sessions_deleted || 0} closed · Agent runs: {data.budget?.agent_runs || 0}</p>
        {data.budget?.notes && <p className="err" role="alert">{data.budget.notes}</p>}
      </section>

      <section className="panel"><h2>Worker activity</h2><p className="sub">Latest durable events. Detailed cell outcomes stay in the collection ledger; terminal prints each processed cell.</p>
        {!data.events.length ? <p>No events yet. Waiting for the worker to claim this run.</p> : <ol className="worker-events">{data.events.map((event) => <li key={event.id}><time>{new Date(event.created_at).toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour12: false })} IST</time><strong>{event.source || event.event.replaceAll("_", " ")}</strong><span>{event.message}</span></li>)}</ol>}
      </section>
      <details className="panel"><summary>Source configuration</summary><p className="sub">Changes apply to future runs. Source exclusions remain enforced.</p><div className="toolbar">{data.adapters.map((adapter) => <button type="button" key={adapter.id} disabled={!!busy || adapter.kind === "skip"} onClick={() => void action("source", async () => { await apiPost("/v1/collect/sources", { id: adapter.id, enabled: !adapter.enabled }); })}>{adapter.enabled ? "Disable" : "Enable"} {adapter.id}</button>)}</div></details>
    </>}
  </>;
}
