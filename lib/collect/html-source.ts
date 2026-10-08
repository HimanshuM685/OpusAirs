import { CHALLENGE, PoliteHttp, sharedHttp, skippedHost, type HttpAttempt } from "./http";
import { parseItineraries, validQuote } from "./parse";
import { robotsVerdict } from "./robots";
import type { CollectCell, CollectResult, SourceAdapter } from "./types";

export function defineHtmlSource(spec: {
  id: string;
  carrier: string;
  origin: string;
  path: string;
  sourceRank?: number;
}, http: PoliteHttp = sharedHttp()): SourceAdapter {
  const rank = spec.sourceRank ?? 20;
  const skipped = skippedHost(new URL(spec.origin).hostname);
  const searchUrl = (cell: CollectCell) => {
    const url = new URL(spec.path, spec.origin);
    url.searchParams.set("from", cell.origin); url.searchParams.set("to", cell.destination);
    url.searchParams.set("date", cell.depDate); url.searchParams.set("trip", cell.tripType);
    return url.href;
  };
  const parseHtml = (html: string, cell: CollectCell): CollectResult => {
    const quotes = parseItineraries(html).filter((leg) => leg.flight_no.startsWith(spec.carrier)).map((leg) => ({
      source: spec.id, origin: cell.origin, destination: cell.destination, carrier: spec.carrier,
      flight_no: leg.flight_no, dep_date: cell.depDate, trip_type: cell.tripType, fare_class: leg.fare_class,
      lead_time_days: cell.leadTimeDays, total_fare: leg.total_fare, status: "ok",
    })).filter(validQuote);
    const soldOut = !quotes.length && /sold[ -]?out|no seats available/i.test(html);
    return { source: spec.id, sourceRank: rank, status: quotes.length ? "ok" : soldOut ? "sold_out" : "missing", quotes,
      notes: quotes.length ? "parser_accepted" : soldOut ? "sold_out" : "no_itinerary",
      parserMiss: !quotes.length && !soldOut && /<script|__NEXT_DATA__|id=["'](?:root|app)["']/i.test(html) };
  };
  return {
    id: spec.id,
    carrier: spec.carrier, searchUrl, parseHtml,
    sourceRank: rank,
    kind: skipped ? "skip" : "html",
    host: new URL(spec.origin).host,
    searchPath: spec.path,
    skippedReason: skipped ? "Search crawling excluded by host policy; use operator ingest or partner feeds." : undefined,
    enabled: () => !skipped && process.env.SCRAPE_ENABLED === "true",
    async allowedPath(path) { return (await robotsVerdict(new URL(path, spec.origin).href, http)).verdict === "allow"; },
    async collect(cell: CollectCell): Promise<CollectResult> {
      const attempts: HttpAttempt[] = [];
      const outcome = (status: CollectResult["status"], notes: string, quotes: CollectResult["quotes"] = []): CollectResult => ({ source: spec.id, sourceRank: rank, status, notes, quotes, attempts });
      if (skipped) return outcome("blocked_robots", "host_policy_skip");
      if (process.env.SCRAPE_ENABLED !== "true") return outcome("blocked", "scrape_disabled");
      const href = searchUrl(cell);
      const verdict = await robotsVerdict(href, http, (a) => attempts.push(a));
      if (verdict.verdict !== "allow") return outcome("blocked_robots", verdict.notes);
      const res = await http.request(href, (a) => attempts.push(a));
      if (CHALLENGE.test(res.text)) return outcome("blocked", "challenge_page");
      if ([401, 403].includes(res.status) || (res.status >= 300 && res.status < 400)) return outcome("blocked", res.error);
      if (res.transient || res.status === 0 || res.status >= 400) return outcome("error", res.error);
      return { ...parseHtml(res.text, cell), attempts };
    },
  };
}
