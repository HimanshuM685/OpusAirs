"use client";
import { useEffect, useState } from "react";
import type { CollectionMonitor } from "@/lib/collect/contracts";
import { useResource } from "@/lib/use-resource";
import { number } from "@/lib/format";

export const useCollectionMonitor = (jobId?: string) => useResource<CollectionMonitor>(`/v1/collect/monitor${jobId ? `?job=${encodeURIComponent(jobId)}` : ""}`, {
  ttlMs: 0, pollMs: (data) => data?.jobs.some((j) => j.status === "running" || j.status === "queued") ? 2000 : 15000,
});
export const timeIST = (value?: string | null) => value ? new Date(value).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" }) + " IST" : "—";
export const jobLabel = (status: string) => ({ ok: "Completed", error: "Failed", queued: "Queued", running: "Running", cancelled: "Cancelled" }[status] || status);

export function NextRun({ at }: { at?: string }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const tick = setInterval(() => { if (document.visibilityState === "visible") setNow(Date.now()); }, 1000); return () => clearInterval(tick); }, []);
  if (!at) return <span>No scheduled run</span>;
  const seconds = Math.max(0, Math.ceil((Date.parse(at) - now) / 1000));
  return <span>{timeIST(at)} · {seconds ? `${Math.floor(seconds / 3600)}h ${Math.floor(seconds % 3600 / 60)}m ${seconds % 60}s` : "Due — waiting for an available worker"}</span>;
}

export function WorkerStatus({ data }: { data: CollectionMonitor }) {
  const workers = data.workers.filter((worker) => worker.online);
  return <section className="collector-worker" aria-labelledby="worker-heading">
    <h2 id="worker-heading">Contributor connection</h2>
    {workers.length ? workers.map((worker) => <div key={worker.id}><p><strong>{worker.label}</strong> · {worker.status} · last seen {timeIST(worker.heartbeat_at)}</p>
      <p className="sub">Tinyfish: {worker.tinyfish_reason}{worker.current_job_id ? ` · job ${worker.current_job_id.slice(0, 8)}` : ""}</p></div>)
      : <><p><strong>No contributor online.</strong> Runs stay queued until your laptop worker connects.</p><p className="sub">In this checkout, run <code>npm run collect:worker</code>. Keep Terminal open and laptop awake.</p></>}
  </section>;
}

export function RunProgress({ data }: { data: CollectionMonitor }) {
  const job = data.job;
  if (!job) return <section className="panel"><h2>No collection run yet</h2><p>Choose Tinyfish and start a run, or schedule a date and time below.</p></section>;
  const phase = job.progress?.stage?.replaceAll("_", " ") || (job.status === "running" ? "Waiting for worker progress" : jobLabel(job.status));
  const percent = data.total ? Math.min(100, Math.round(data.completed / data.total * 100)) : 0;
  const counts = data.counts;
  return <section className="panel run-progress" aria-labelledby="run-heading">
    <div className="section-heading"><h2 id="run-heading">{jobLabel(job.status)} collection</h2><span className={`run-state state-${job.status}`}>{job.cancel_requested && job.status === "running" ? "Stopping — cleaning up sessions" : phase}</span></div>
    <p className="job-id">{job.id} · {job.payload?.transportMode || "Legacy run"}</p>
    <div className="run-progress-label"><strong>{number(data.completed)} / {number(data.total)} cells processed</strong><span>{data.total ? `${percent}%` : "Worklist not started"}</span></div>
    <progress value={data.completed} max={data.total || 1} aria-label="Collection cells processed" />
    <p className="sub">Processed includes missing and blocked cells. It does not mean fares were found.</p>
    <dl className="run-counts">{[["Quotes saved", data.quotes], ["Cells with fares", counts.done || 0], ["Missing", counts.missing || 0], ["Blocked", (counts.blocked || 0) + (counts.blocked_robots || 0)], ["Errors", counts.error || 0], ["Waiting", (counts.pending || 0) + (counts.running || 0)]].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{number(Number(value))}</dd></div>)}</dl>
    {job.status === "queued" && <p role="status">Waiting for a collection worker. {data.workers.some((w) => w.online) ? "A connected contributor will claim this run when available." : "Start your laptop worker to continue."}</p>}
    {job.status === "running" && <p><strong>{job.progress?.source || "Worker"}</strong>{job.progress?.current_cell ? ` · ${job.progress.current_cell}` : ""} · {job.progress?.transport || job.payload?.transportMode || "Preparing"}</p>}
    {job.error && <p className="err" role="alert">{job.error}</p>}
    <p className="sub">Started {timeIST(job.started_at)} · heartbeat {timeIST(job.heartbeat_at)}</p>
    {job.status === "running" && job.heartbeat_at && Date.now() - Date.parse(job.heartbeat_at) > 30000 && <p className="quality-note">Worker heartbeat is stale. Last saved progress is shown. Check your contributor terminal and connection.</p>}
  </section>;
}
