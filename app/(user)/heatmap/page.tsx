"use client";
import Link from "next/link";
import { useMemo } from "react";
import type { HeatmapCell } from "@/lib/api";
import { useResource } from "@/lib/use-resource";
import { useUrlState } from "@/lib/use-url-state";
import { date, number } from "@/lib/format";
import { PageHeading } from "@/components/page-heading";
import { ResourceState } from "@/components/resource-state";

export default function HeatmapPage() {
  const resource = useResource<HeatmapCell[]>("/v1/heatmap");
  const { params, update } = useUrlState();
  const query = params.get("q") || "";
  const { routes, dates, values } = useMemo(() => {
    const cells = resource.data || [];
    return { routes: [...new Set(cells.map((c) => `${c.origin}-${c.destination}`))].sort().filter((r) => r.toLowerCase().includes(query.toLowerCase())),
      dates: [...new Set(cells.map((c) => c.period_date))].sort(), values: new Map(cells.map((c) => [`${c.origin}-${c.destination}|${c.period_date}`, c.value])) };
  }, [resource.data, query]);
  const pages = Math.max(1, Math.ceil(routes.length / 20));
  const page = Math.min(pages, Math.max(1, Number(params.get("page")) || 1));
  const datePages = Math.max(1, Math.ceil(dates.length / 14));
  const datePage = Math.min(datePages, Math.max(1, Number(params.get("dates")) || datePages));
  const visibleDates = dates.slice((datePage - 1) * 14, datePage * 14);
  return <>
    <PageHeading title="Route heatmap">Compare daily route indices. Each cell includes its numeric value; 100 is the base window.</PageHeading>
    <div className="toolbar"><label>Filter routes<input name="q" type="search" autoComplete="off" placeholder="DEL-BOM…" value={query} onChange={(e) => update({ q: e.target.value, page: null })} /></label>
      <div className="pagination"><button disabled={datePage === 1} onClick={() => update({ dates: String(datePage - 1) })}>Earlier dates</button><span>{visibleDates.length ? `${date(visibleDates[0])} – ${date(visibleDates.at(-1))}` : "No dates"}</span><button disabled={datePage === datePages} onClick={() => update({ dates: String(datePage + 1) })}>Later dates</button></div></div>
    <ResourceState {...resource} retry={resource.refresh} empty={Boolean(resource.data) && !routes.length} label="matching observations" />
    {!!routes.length && <section className="panel"><div className="table-scroll" tabIndex={0} role="region" aria-label="Route index heatmap"><table className="heatmap-table"><thead><tr><th scope="col">Route</th>{visibleDates.map((d) => <th key={d} scope="col">{date(d)}</th>)}</tr></thead>
      <tbody>{routes.slice((page - 1) * 20, page * 20).map((r) => <tr key={r}><th scope="row"><Link className="text-link" href={`/routes/${r}`}>{r}</Link></th>{visibleDates.map((d) => {
        const value = values.get(`${r}|${d}`);
        return <td key={d} style={{ background: value == null ? "#f7faf8" : value > 110 ? "#f9e0dd" : value < 95 ? "#d5e9dd" : "#edf1d9", color: "#172c23" }}>{number(value, 1)}</td>;
      })}</tr>)}</tbody></table></div><p className="sub">Green: below 95 · neutral: 95–110 · red: above 110 · —: no observation.</p>
      <div className="pagination"><button disabled={page === 1} onClick={() => update({ page: String(page - 1) })}>Previous routes</button><span>Page {page} of {pages}</span><button disabled={page === pages} onClick={() => update({ page: String(page + 1) })}>Next routes</button></div></section>}
  </>;
}
