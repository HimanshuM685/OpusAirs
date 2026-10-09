"use client";
import Link from "next/link";
import { useMemo } from "react";
import type { RouteOut } from "@/lib/api";
import { useResource } from "@/lib/use-resource";
import { useUrlState } from "@/lib/use-url-state";
import { money, number, percent } from "@/lib/format";
import { PageHeading } from "@/components/page-heading";
import { ResourceState } from "@/components/resource-state";

export default function RoutesPage() {
  const resource = useResource<RouteOut[]>("/v1/routes");
  const { params, update } = useUrlState();
  const query = params.get("q") || "";
  const rows = useMemo(() => (resource.data || []).filter((r) => `${r.origin} ${r.destination}`.toLowerCase().includes(query.trim().toLowerCase())), [resource.data, query]);
  const pages = Math.max(1, Math.ceil(rows.length / 25));
  const page = Math.min(pages, Math.max(1, Number(params.get("page")) || 1));
  return <>
    <PageHeading title="Basket routes">Passenger-weighted city pairs used in the index. Open a route for its observations or compare collected fares.</PageHeading>
    <div className="toolbar"><label>Find a route<input name="q" type="search" autoComplete="off" placeholder="DEL, BOM, BLR…" value={query} onChange={(e) => update({ q: e.target.value, page: null })} /></label><span>{number(rows.length)} routes</span></div>
    <ResourceState {...resource} retry={resource.refresh} empty={Boolean(resource.data) && !rows.length} label="matching routes" />
    {rows.length > 0 && <section className="panel"><div className="table-scroll" role="region" aria-label="Basket routes" tabIndex={0}><table><thead><tr>{["Route", "Basket weight", "Passengers", "Latest APIx", "Contribution", "Latest fare", "Compare"].map((v) => <th key={v} scope="col">{v}</th>)}</tr></thead>
      <tbody>{rows.slice((page - 1) * 25, page * 25).map((r) => <tr key={`${r.origin}-${r.destination}`}><td><Link className="text-link" href={`/routes/${r.origin}-${r.destination}`}>{r.origin} → {r.destination}</Link></td><td>{percent(r.weight)}</td><td>{number(r.raw_passengers)}</td><td>{number(r.latest_index, 2)}</td><td>{number(r.contribution, 3)}</td><td>{money(r.latest_fare)}</td><td><Link className="text-link" href={`/search?origin=${r.origin}&dest=${r.destination}`} aria-label={`Compare ${r.origin} to ${r.destination}`}>Check fares</Link></td></tr>)}</tbody></table></div>
      <div className="pagination"><button type="button" disabled={page === 1} onClick={() => update({ page: String(page - 1) })}>Previous</button><span>Page {page} of {pages}</span><button type="button" disabled={page === pages} onClick={() => update({ page: String(page + 1) })}>Next</button></div></section>}
  </>;
}
