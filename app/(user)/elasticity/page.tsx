"use client";
import dynamic from "next/dynamic";
import type { ElasticityPoint } from "@/lib/api";
import { useResource } from "@/lib/use-resource";
import { money, number } from "@/lib/format";
import { ResourceState } from "@/components/resource-state";
import { PageHeading } from "@/components/page-heading";
const Chart = dynamic(() => import("@/components/charts/series-chart"), { loading: () => <div className="chart-placeholder" /> });
export default function ElasticityPage() {
  const resource = useResource<ElasticityPoint[]>("/v1/elasticity");
  const rows = resource.data || [];
  const t1 = rows.find((r) => r.lead_time_days === 1)?.mean_total_fare;
  const t30 = rows.find((r) => r.lead_time_days === 30)?.mean_total_fare;
  return <>
    <PageHeading title="Booking windows">Mean observed fare by days before departure. These historical comparisons are not a prediction or booking recommendation.</PageHeading>
    <ResourceState {...resource} retry={resource.refresh} empty={Boolean(resource.data) && !rows.length} label="booking-window observations" />
    <div className="metric-strip"><div><span>One day before</span><strong>{money(t1)}</strong></div><div><span>30 days before</span><strong>{money(t30)}</strong></div><div><span>T+1 versus T+30</span><strong>{t1 != null && t30 ? `${number((t1 / t30 - 1) * 100, 1)}%` : "—"}</strong></div></div>
    {!!rows.length && <div className="analysis-grid"><section className="panel"><h2>Lead-time fare curve</h2><Chart data={rows} x="lead_time_days" lead currency lines={[{ key: "mean_total_fare", label: "Mean fare", color: "#0b3b2a" }]} /></section>
      <section className="panel"><h2>Observed averages</h2><table><thead><tr><th scope="col">Days before departure</th><th scope="col">Mean fare</th></tr></thead><tbody>{rows.map((r) => <tr key={r.lead_time_days}><td>T+{r.lead_time_days}</td><td>{money(r.mean_total_fare)}</td></tr>)}</tbody></table></section></div>}
  </>;
}
