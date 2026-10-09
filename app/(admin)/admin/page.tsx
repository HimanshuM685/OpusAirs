"use client";
import Link from "next/link";
import type { CollectionSummary, PipelineJob } from "@/lib/api";
import { useResource } from "@/lib/use-resource";
import { date, number, percent } from "@/lib/format";
import { ResourceState } from "@/components/resource-state";
import { PageHeading } from "@/components/page-heading";

export default function AdminOverviewPage() {
  const health = useResource<CollectionSummary>("/v1/health/collection", { pollMs: 15000, ttlMs: 10000 });
  const jobs = useResource<PipelineJob[]>("/v1/jobs", { pollMs: 15000, ttlMs: 10000 });
  return <>
    <PageHeading title="Operator overview" action={<Link className="btn primary" href="/admin/ingest">Feed quotes</Link>}>Monitor collection quality and durable background jobs. Refresh pauses when this tab is hidden or offline.</PageHeading>
    <ResourceState {...health} retry={health.refresh} label="collection health" />
    <div className="metric-strip"><div><span>Observed coverage</span><strong>{percent(health.data?.coverage)}</strong></div><div><span>Missing cells</span><strong>{number(health.data?.unavailable_cells)}</strong></div><div><span>Quality</span><strong>{health.data?.quality || "—"}</strong></div></div>
    <p className="sub">Latest snapshot: {date(health.data?.last_snapshot_at, true)} IST. Queued jobs need a running collection worker.</p>
    <section className="panel"><h2>Recent jobs</h2><ResourceState {...jobs} retry={jobs.refresh} empty={Boolean(jobs.data) && !jobs.data?.length} label="jobs" />
      {!!jobs.data?.length && <div className="table-scroll"><table><thead><tr><th scope="col">Job</th><th scope="col">State</th><th scope="col">Started</th><th scope="col">Finished</th><th scope="col">Details</th></tr></thead><tbody>{jobs.data.map((j) => <tr key={j.id}><td>{j.type}<small className="job-id">{j.id}</small></td><td>{j.status}</td><td>{date(j.started_at, true)}</td><td>{date(j.finished_at, true)}</td><td>{j.error || (j.type === "ingest" ? <Link className="text-link" href={`/admin/ingest?job=${j.id}`}>View progress</Link> : "—")}</td></tr>)}</tbody></table></div>}
    </section>
    <section className="panel"><h2>Sources</h2><div className="table-scroll"><table><thead><tr>{["Source", "Status", "OK", "Missing", "Blocked", "Last run"].map((v) => <th key={v} scope="col">{v}</th>)}</tr></thead><tbody>{health.data?.sources.map((s) => <tr key={s.source}><td>{s.source}</td><td>{s.status}</td><td>{number(s.quotes_ok)}</td><td>{number(s.quotes_missing)}</td><td>{number(s.quotes_blocked)}</td><td>{date(s.last_finished_at || s.last_started_at, true)}</td></tr>)}</tbody></table></div><Link className="text-link" href="/admin/scrape">Collection controls</Link></section>
  </>;
}
