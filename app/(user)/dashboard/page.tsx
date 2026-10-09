"use client";
import { useMemo } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import type { IndexPoint, RouteOut } from "@/lib/api";
import { useResource } from "@/lib/use-resource";
import { useUrlState } from "@/lib/use-url-state";
import { date, number, percent } from "@/lib/format";
import { PageHeading } from "@/components/page-heading";
import { ResourceState } from "@/components/resource-state";
import { Deferred } from "@/components/deferred";
const Chart = dynamic(() => import("@/components/charts/series-chart"), { loading: () => <div className="chart-placeholder" /> });
const SERIES = [["apix_laspeyres", "Passenger-weighted Laspeyres"], ["apix_jevons", "Unweighted Jevons"], ["apix_t21", "T+21 comparable"], ["apix_chain", "Chain-linked"], ["apix_laspeyres_ma7", "7-day moving mean"]];
const WINDOWS = [["30d", "30 days", 30], ["3m", "3 months", 90], ["6m", "6 months", 180], ["all", "All", 99999]] as const;
export default function DashboardPage() {
  const { params, update } = useUrlState();
  const frequency = ["daily", "weekly", "monthly"].includes(params.get("frequency") || "") ? params.get("frequency")! : "daily";
  const series = SERIES.some(([key]) => key === params.get("series")) ? params.get("series")! : "apix_laspeyres";
  const window = WINDOWS.find(([key]) => key === params.get("window")) || WINDOWS[3];
  const index = useResource<IndexPoint[]>(`/v1/index?frequency=${frequency}&series=${series}`);
  const routes = useResource<RouteOut[]>("/v1/routes");
  const health = useResource<{ ok: boolean; coverage: number; last_snapshot_at?: string }>("/v1/health");
  const rows = useMemo(() => {
    const all = index.data || [];
    const end = all.at(-1)?.period_date;
    if (!end || window[0] === "all") return all;
    const cutoff = new Date(end); cutoff.setUTCDate(cutoff.getUTCDate() - window[2]);
    return all.filter((r) => r.period_date >= cutoff.toISOString().slice(0, 10));
  }, [index.data, window]);
  const latest = rows.at(-1), first = rows[0];
  const change = latest && first && first.value > 0 ? (latest.value / first.value - 1) * 100 : null;
  return <>
    <PageHeading title="Airfare overview" action={<Link className="btn primary" href="/search">Check route prices</Link>}>Daily price movement across the passenger-weighted domestic basket. Base index: 100.</PageHeading>
    <div className="toolbar">
      <label>Frequency<select value={frequency} onChange={(e) => update({ frequency: e.target.value })}>{["daily", "weekly", "monthly"].map((v) => <option key={v}>{v}</option>)}</select></label>
      <label>Index series<select value={series} onChange={(e) => update({ series: e.target.value })}>{SERIES.map(([key, name]) => <option key={key} value={key}>{name}</option>)}</select></label>
      <div className="window-toggle" aria-label="Time window">{WINDOWS.map(([key, label]) => <button key={key} type="button" aria-pressed={window[0] === key} className={window[0] === key ? "active" : ""} onClick={() => update({ window: key })}>{label}</button>)}</div>
    </div>
    <ResourceState loading={index.loading} error={index.error} retry={index.refresh} empty={Boolean(index.data) && !rows.length} label="index observations" />
    {health.data && (!health.data.ok || health.data.coverage < .8) && <p className="quality-note" role="status">Limited observed coverage ({percent(health.data.coverage)}). Read imputed share alongside index values. Latest snapshot: {date(health.data.last_snapshot_at, true)} IST.</p>}
    {health.error && <ResourceState error={health.error} retry={health.refresh} />}
    <div className="metric-strip"><div><span>Latest APIx</span><strong>{number(latest?.value, 2)}</strong></div><div><span>Change in window</span><strong>{change == null ? "—" : `${number(change, 2)}%`}</strong></div><div><span>Observed coverage</span><strong>{percent(latest?.coverage)}</strong></div><div><span>Imputed share</span><strong>{percent(latest?.imputed_share)}</strong></div></div>
    <div className="analysis-grid"><section className="panel"><h2>Index movement</h2>{rows.length > 0 && <Chart data={rows} />}<p className="sub">{SERIES.find(([key]) => key === series)?.[1]}. Window ends at the latest available observation.</p></section>
      <section className="panel"><h2>Basket routes</h2><ResourceState loading={routes.loading} error={routes.error} retry={routes.refresh} label="routes" />
        <ul className="route-highlights">{routes.data?.slice(0, 5).map((r) => <li key={`${r.origin}-${r.destination}`}><Link href={`/routes/${r.origin}-${r.destination}`}>{r.origin} → {r.destination}</Link><span>{percent(r.weight)} weight</span></li>)}</ul><Link className="text-link" href="/routes">Explore all routes</Link></section></div>
    {!!rows.length && <section className="panel"><h2>Recent observations</h2><Deferred height={220}><div className="table-scroll"><table><thead><tr><th scope="col">Period</th><th scope="col">Index</th><th scope="col">Coverage</th><th scope="col">Imputed</th><th scope="col">Vintage</th></tr></thead><tbody>{rows.slice(-10).reverse().map((r) => <tr key={r.period_date}><td>{date(r.period_date)}</td><td>{number(r.value, 2)}</td><td>{percent(r.coverage)}</td><td>{percent(r.imputed_share)}</td><td>{r.vintage || "Unspecified"}</td></tr>)}</tbody></table></div></Deferred></section>}
  </>;
}
