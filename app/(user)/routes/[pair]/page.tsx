"use client";
import Link from "next/link";
import { useParams } from "next/navigation";
import dynamic from "next/dynamic";
import type { IndexPoint, QuoteOut } from "@/lib/api";
import { useResource } from "@/lib/use-resource";
import { date, money } from "@/lib/format";
import { PageHeading } from "@/components/page-heading";
import { ResourceState } from "@/components/resource-state";
const Chart = dynamic(() => import("@/components/charts/series-chart"), { loading: () => <div className="chart-placeholder" /> });

export default function RouteDetailPage() {
  const { pair } = useParams<{ pair: string }>();
  const valid = /^[A-Z]{3}-[A-Z]{3}$/.test(pair);
  const [origin, dest] = pair.split("-");
  const index = useResource<IndexPoint[]>(valid ? `/v1/index/routes/${origin}/${dest}?frequency=daily` : null);
  const quotes = useResource<QuoteOut[]>(valid ? `/v1/quotes?origin=${origin}&dest=${dest}&limit=40` : null);
  if (!valid) return <><PageHeading title="Route not found">Choose a route from the basket.</PageHeading><Link href="/routes">Browse routes</Link></>;
  return <>
    <PageHeading title={`${origin} → ${dest}`} action={<Link className="btn primary" href={`/search?origin=${origin}&dest=${dest}`}>Check fares</Link>}>Route-level APIx and recent cleaned observations.</PageHeading>
    <section className="panel"><h2>Index history</h2><ResourceState {...index} retry={index.refresh} empty={Boolean(index.data) && !index.data?.length} label="index history" />{!!index.data?.length && <Chart data={index.data} />}</section>
    <section className="panel"><h2>Recent fares</h2><ResourceState {...quotes} retry={quotes.refresh} empty={Boolean(quotes.data) && !quotes.data?.length} label="fare observations" />
      {!!quotes.data?.length && <div className="table-scroll"><table><thead><tr>{["Collected", "Carrier", "Departure", "Lead", "Base", "Taxes", "UDF", "Fee", "Total"].map((v) => <th key={v} scope="col">{v}</th>)}</tr></thead><tbody>{quotes.data.map((q, i) => <tr key={`${q.flight_no}-${q.collected_on}-${i}`}><td>{date(q.collected_on)}</td><td>{q.carrier}</td><td>{date(q.dep_date)}</td><td>T+{q.lead_time_days}</td><td>{money(q.base_fare)}</td><td>{money(q.taxes)}</td><td>{money(q.udf)}</td><td>{money(q.convenience)}</td><td>{money(q.total_fare)}</td></tr>)}</tbody></table></div>}
    </section>
  </>;
}
