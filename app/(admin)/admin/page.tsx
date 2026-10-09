"use client";
import Link from "next/link";
import { ResourceState } from "@/components/resource-state";
import { PageHeading } from "@/components/page-heading";
import { NextRun, RunProgress, WorkerStatus, jobLabel, timeIST, useCollectionMonitor } from "@/components/collection-status";

export default function AdminOverviewPage() {
  const monitor = useCollectionMonitor(); const data = monitor.data;
  const next = data?.schedules.find((s) => s.status === "scheduled");
  return <>
    <PageHeading title="Operator overview" action={<Link className="btn primary" href="/admin/scrape">Collection control</Link>}>Your laptop contributes collection work. This dashboard follows its saved progress and next scheduled start.</PageHeading>
    <div className="monitor-sync"><span>{monitor.refreshing ? "Syncing progress…" : monitor.updatedAt ? `Updated ${new Date(monitor.updatedAt).toLocaleTimeString()}` : "Connecting…"}</span><button onClick={monitor.refresh}>Refresh</button></div>
    <ResourceState error={monitor.error} loading={monitor.loading} retry={monitor.refresh} label="operator overview" />
    {data && <><WorkerStatus data={data} /><p className="next-run"><strong>Next run</strong> · <NextRun at={next?.run_at} /></p><RunProgress data={data} />
      <section className="panel"><h2>Recent collection runs</h2><div className="table-scroll" tabIndex={0}><table><thead><tr><th>Run</th><th>State</th><th>Transport</th><th>Created</th><th>Last heartbeat</th></tr></thead><tbody>{data.jobs.map((job) => <tr key={job.id}><td><Link className="text-link" href={`/admin/scrape?job=${job.id}`}>{job.id.slice(0, 8)}</Link></td><td>{jobLabel(job.status)}</td><td>{job.payload.transportMode || "Legacy"}</td><td>{timeIST(job.created_at)}</td><td>{timeIST(job.heartbeat_at)}</td></tr>)}</tbody></table></div></section>
    </>}
  </>;
}
