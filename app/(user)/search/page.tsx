"use client";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import dynamic from "next/dynamic";
import type { RouteOut, SearchResult, TrendPoint } from "@/lib/api";
import { useResource } from "@/lib/use-resource";
import { useUrlState } from "@/lib/use-url-state";
import { date, money, number } from "@/lib/format";
import { PageHeading } from "@/components/page-heading";
import { ResourceState } from "@/components/resource-state";
import { Deferred } from "@/components/deferred";

const Chart = dynamic(() => import("@/components/charts/series-chart"), { loading: () => <div className="chart-placeholder" /> });
const WINDOWS = [["30d", "30 days"], ["3m", "3 months"], ["6m", "6 months"], ["all", "All"]];

export default function SearchPage() {
  const { params, update } = useUrlState();
  const origin = (params.get("origin") || "").toUpperCase();
  const dest = (params.get("dest") || "").toUpperCase();
  const trip = params.get("trip_type") === "round_trip" ? "round_trip" : "one_way";
  const window = WINDOWS.some(([key]) => key === params.get("window")) ? params.get("window")! : "30d";
  const departure = params.get("dep_date") || "";
  const cabin = params.get("cabin") || "";
  const [draft, setDraft] = useState({ origin: origin || "DEL", dest: dest || "BOM", trip, departure, cabin });
  const [validation, setValidation] = useState<string | null>(null);
  useEffect(() => { setDraft({ origin: origin || "DEL", dest: dest || "BOM", trip, departure, cabin }); }, [origin, dest, trip, departure, cabin]);
  const valid = /^[A-Z]{3}$/.test(origin) && /^[A-Z]{3}$/.test(dest) && origin !== dest;
  const query = new URLSearchParams({ origin, dest, trip_type: trip });
  if (departure) query.set("dep_date", departure);
  if (cabin) query.set("cabin", cabin);
  const result = useResource<SearchResult>(valid ? `/v1/search?${query}` : null);
  // Independent resources start together. Changing the window never re-fetches fares.
  const trend = useResource<TrendPoint[]>(valid ? `/v1/trends/${origin}/${dest}?window=${window}&trip_type=${trip}` : null);
  const routes = useResource<RouteOut[]>("/v1/routes");
  const airports = useMemo(() => [...new Set((routes.data || []).flatMap((r) => [r.origin, r.destination]))].sort(), [routes.data]);
  const page = Math.max(1, Number(params.get("page")) || 1);
  const fares = result.data?.carriers || [];
  const pages = Math.max(1, Math.ceil(fares.length / 20));
  const currentPage = Math.min(page, pages);
  const recent = trend.data?.at(-1);
  const first = trend.data?.[0];
  const change = first && recent && first.avg_fare > 0 ? (recent.avg_fare / first.avg_fare - 1) * 100 : null;

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const o = draft.origin.trim().toUpperCase(), d = draft.dest.trim().toUpperCase();
    if (!/^[A-Z]{3}$/.test(o) || !/^[A-Z]{3}$/.test(d) || o === d) { setValidation("Choose two different three-letter airport codes, such as DEL and BOM."); return; }
    setValidation(null);
    update({ origin: o, dest: d, trip_type: draft.trip, dep_date: draft.departure, cabin: draft.cabin, page: null }, true);
    if (o === origin && d === dest && trip === draft.trip && departure === draft.departure && cabin === draft.cabin) { result.refresh(); trend.refresh(); }
  }

  return <>
    <PageHeading title="Price check">Compare collected domestic fares. Results come from the warehouse; searches do not start live scraping or book flights.</PageHeading>
    <form className="panel search-form" onSubmit={submit} aria-describedby={validation ? "search-error" : undefined}>
      <div className="search-airports">
        <label>From<input name="origin" value={draft.origin} onChange={(e) => setDraft({ ...draft, origin: e.target.value.toUpperCase() })} list="airports" maxLength={3} required autoComplete="off" spellCheck={false} placeholder="DEL…" /></label>
        <button type="button" className="swap-button" aria-label="Swap origin and destination" onClick={() => setDraft({ ...draft, origin: draft.dest, dest: draft.origin })}>⇄</button>
        <label>To<input name="dest" value={draft.dest} onChange={(e) => setDraft({ ...draft, dest: e.target.value.toUpperCase() })} list="airports" maxLength={3} required autoComplete="off" spellCheck={false} placeholder="BOM…" /></label>
      </div>
      <label>Trip<select name="trip_type" value={draft.trip} onChange={(e) => setDraft({ ...draft, trip: e.target.value as typeof trip })}><option value="one_way">One way</option><option value="round_trip">Round trip</option></select></label>
      <label>Departure <span className="optional">(optional)</span><input name="dep_date" type="date" value={draft.departure} onChange={(e) => setDraft({ ...draft, departure: e.target.value })} /></label>
      <label>Cabin<select name="cabin" value={draft.cabin} onChange={(e) => setDraft({ ...draft, cabin: e.target.value })}><option value="">All cabins</option><option value="ECONOMY">Economy</option><option value="PREMIUM_ECONOMY">Premium economy</option><option value="BUSINESS">Business</option></select></label>
      <button type="submit" className="primary" disabled={result.loading}>Check fares</button>
      <datalist id="airports">{airports.map((a) => <option key={a} value={a} />)}</datalist>
      {validation && <p id="search-error" className="err" role="alert">{validation}</p>}
    </form>
    {routes.error && <p className="sub">Airport suggestions unavailable. Enter airport codes directly.</p>}
    {!valid && <div className="empty-state"><h2>Choose a route to begin</h2><p>Enter your airports above. You can share the results URL or return to it later.</p></div>}
    <ResourceState loading={result.loading} error={result.error} retry={result.refresh} label="collected fares" empty={valid && Boolean(result.data) && fares.length === 0} />
    {result.data && <>
      <div className="metric-strip"><div><span>Route</span><strong>{origin} → {dest}</strong></div><div><span>Lowest collected fare</span><strong>{money(result.data.cheapest)}</strong></div>
        <div><span>Quotes returned</span><strong>{number(result.data.quote_count)}</strong></div><div><span>Trend change · {window}</span><strong>{change == null ? "—" : `${number(change, 1)}%`}</strong></div></div>
      {fares.length > 0 && <section className="panel"><h2>Fare breakdown</h2><p className="sub">Historical observations, sorted by fare. Check departure and collection dates before comparing.</p>
        <div className="table-scroll" tabIndex={0} role="region" aria-label="Fare observations"><table><thead><tr>{["Carrier", "Flight", "Departure", "Cabin", "Base", "Taxes", "UDF", "Fee", "Total", "Collected"].map((title) => <th key={title} scope="col">{title}</th>)}</tr></thead>
          <tbody>{fares.slice((currentPage - 1) * 20, currentPage * 20).map((f, i) => <tr key={`${f.flight_no}-${f.dep_date}-${i}`}><td>{f.carrier}</td><td>{f.flight_no}</td><td>{date(f.dep_date)}</td><td>{f.fare_class}</td><td>{money(f.base_fare)}</td><td>{money(f.taxes)}</td><td>{money(f.udf)}</td><td>{money(f.convenience)}</td><td><strong>{money(f.total_fare)}</strong></td><td>{date(f.collected_on)}</td></tr>)}</tbody></table></div>
        {pages > 1 && <div className="pagination"><button disabled={currentPage === 1} onClick={() => update({ page: String(currentPage - 1) })}>Previous</button><span>Page {currentPage} of {pages}</span><button disabled={currentPage === pages} onClick={() => update({ page: String(currentPage + 1) })}>Next</button></div>}
      </section>}
    </>}
    {valid && <section className="panel"><div className="section-heading"><h2>Price history</h2><div className="window-toggle" aria-label="History window">{WINDOWS.map(([key, label]) => <button key={key} type="button" aria-pressed={window === key} className={window === key ? "active" : ""} onClick={() => update({ window: key })}>{label}</button>)}</div></div>
      <p className="sub">All departure dates and cabins for {origin} → {dest}, {trip.replace("_", " ")}. Departure and cabin filters apply to the fare table.</p>
      <ResourceState loading={trend.loading} error={trend.error} retry={trend.refresh} empty={Boolean(trend.data) && !trend.data?.length} label="history" />
      {!!trend.data?.length && <Deferred><Chart currency data={trend.data} lines={[{ key: "avg_fare", label: "Average fare", color: "#0b3b2a" }, { key: "min_fare", label: "Lowest fare", color: "#957224" }]} /></Deferred>}
    </section>}
  </>;
}
