"use client";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { apiPost, apiUpload, clearApiCache, type PipelineJob } from "@/lib/api";
import { useResource } from "@/lib/use-resource";
import { useUrlState } from "@/lib/use-url-state";
import { number } from "@/lib/format";
import { PageHeading } from "@/components/page-heading";
import { ResourceState } from "@/components/resource-state";
type Needed = { origin: string; destination: string; trip_type: string; lead_time_days: number; last_collected_on: string | null; dump_line: string };
const CSV_HEADER = "source,origin,destination,carrier,flight_no,dep_date,return_date,trip_type,lead_time_days,collected_on,base_fare,taxes,udf,convenience,total_fare,status";
export default function IngestPage() {
  const { params, update } = useUrlState();
  const jobId = params.get("job");
  const validJob = jobId && /^[0-9a-f-]{36}$/i.test(jobId);
  const job = useResource<PipelineJob>(validJob ? `/v1/jobs/${jobId}` : null, { pollMs: 2000, ttlMs: 0, stopWhen: (j) => ["ok", "error"].includes(j.status) });
  const needed = useResource<{ needed: Needed[]; count: number }>("/v1/ingest/needed");
  const [text, setText] = useState("");
  const [restored, setRestored] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const active = useRef<AbortController | null>(null);
  const completed = useRef<string | null>(null);
  const working = Boolean(job.data && ["queued", "running"].includes(job.data.status));
  const locked = busy || working || Boolean(validJob && job.loading && !job.data);
  useEffect(() => { try { setText(sessionStorage.getItem("opus-ingest-draft") || ""); } catch {} setRestored(true); return () => active.current?.abort(); }, []);
  useEffect(() => { if (restored) try { sessionStorage.setItem("opus-ingest-draft", text); } catch {} }, [text, restored]);
  useEffect(() => {
    if (job.data?.status === "ok" && completed.current !== job.data.id) {
      completed.current = job.data.id; clearApiCache(); needed.refresh();
    }
  }, [job.data, needed.refresh]);
  async function queue(file?: File) {
    if (locked || active.current) return;
    if (file && file.size > 2 * 1024 * 1024) { setError(new Error("Choose a CSV file smaller than 2 MB.")); return; }
    setBusy(true); setError(null);
    const controller = new AbortController(); active.current = controller;
    try {
      let result: { job_id: string };
      if (file) { const form = new FormData(); form.append("file", file); result = await apiUpload("/v1/ingest/csv", form, { signal: controller.signal }); }
      else result = await apiPost("/v1/ingest/dump", { text, rebuild_index: true }, { signal: controller.signal });
      update({ job: result.job_id }, true);
    } catch (err) { if (!controller.signal.aborted) setError(err instanceof Error ? err : new Error(String(err))); }
    finally { active.current = null; setBusy(false); }
  }
  const page = Math.max(1, Number(params.get("page")) || 1);
  const rows = needed.data?.needed || [];
  const pages = Math.max(1, Math.ceil(rows.length / 20));
  const currentPage = Math.min(page, pages);
  return <>
    <PageHeading title="Feed quotes">Paste fare observations or upload CSV. Submit once, then track parsing, ingestion, and index rebuild as a background job.</PageHeading>
    <ResourceState error={error} />
    {validJob && <section className="panel job-progress" aria-live="polite"><h2>Ingestion progress</h2><p className="job-id">{jobId}</p>
      <ResourceState {...job} retry={job.refresh} label="job status" />
      {job.data && <><p><strong>{job.data.status === "queued" ? "Queued — waiting for the worker" : job.data.status === "running" ? "Processing observations…" : job.data.status === "ok" ? "Completed" : "Job failed"}</strong></p>
        {job.data.status === "queued" && <p className="sub">Keep <code>npm run collect:worker</code> running. You can leave this page and return using this URL.</p>}
        {job.data.error && <p className="err" role="alert">{job.data.error}</p>}
        {job.data.status === "ok" && <p>{number(Number(job.data.stats?.received || 0))} observations processed; {number(Number(job.data.stats?.index_rows || 0))} index rows rebuilt.</p>}
        {["ok", "error"].includes(job.data.status) && <button type="button" onClick={() => update({ job: null })}>Start another submission</button>}</>}
      <p className="sub">Status refresh pauses in hidden tabs and resumes when you return.</p>
    </section>}
    <form className="panel" onSubmit={(e: FormEvent) => { e.preventDefault(); void queue(); }}>
      <h2>Paste observations</h2><p className="sub">JSON, CSV, or prose. Prose needs the worker’s Gemini configuration. Departure dates are required. Your draft stays in this tab.</p>
      <label htmlFor="fare-dump">Fare data</label><textarea id="fare-dump" name="text" rows={9} spellCheck={false} value={text} maxLength={500000} onChange={(e) => setText(e.target.value)} placeholder="Paste CSV headers and fare rows…" disabled={busy} />
      <button className="primary" type="submit" disabled={locked || !text.trim()}>{busy ? "Queueing…" : working ? "Job in progress" : "Queue ingestion"}</button>
    </form>
    <section className="panel"><h2>Upload CSV</h2><p className="sub">Maximum 2 MB. The worker parses the file and rebuilds the index.</p><div className="toolbar">
      <a className="text-link" href="/v1/ingest/template" download>Download CSV template</a><label>Choose CSV<input name="csv" type="file" accept=".csv,text/csv" disabled={locked} onChange={(e) => { const file = e.target.files?.[0]; if (file) void queue(file); e.target.value = ""; }} /></label></div></section>
    <section className="panel"><h2>Missing observations</h2><p className="sub">Economy, one-way basket gaps across T+1/7/15/21/30/45 and configured snapshot slots.</p><ResourceState {...needed} retry={needed.refresh} empty={Boolean(needed.data) && !rows.length} label="missing cells" />
      {!!rows.length && <><div className="table-scroll"><table><thead><tr><th scope="col">Route</th><th scope="col">Lead</th><th scope="col">Last seen</th><th scope="col">Draft</th></tr></thead><tbody>{rows.slice((currentPage - 1) * 20, currentPage * 20).map((r, i) => <tr key={`${r.origin}-${r.destination}-${r.lead_time_days}-${i}`}><td>{r.origin} → {r.destination}</td><td>T+{r.lead_time_days}</td><td>{r.last_collected_on || "Never"}</td><td><button type="button" disabled={busy} onClick={() => setText((prev) => prev.startsWith(CSV_HEADER) ? `${prev.trim()}\n${r.dump_line}` : `${CSV_HEADER}\n${r.dump_line}`)} aria-label={`Add ${r.origin} to ${r.destination} T+${r.lead_time_days} to draft`}>Add CSV row</button></td></tr>)}</tbody></table></div>
        <div className="pagination"><button disabled={currentPage === 1} onClick={() => update({ page: String(currentPage - 1) })}>Previous</button><span>Page {currentPage} of {pages}</span><button disabled={currentPage === pages} onClick={() => update({ page: String(currentPage + 1) })}>Next</button></div></>}
    </section>
  </>;
}
