import { CHALLENGE, PoliteHttp, skippedHost, type HttpAttempt } from "./http";
import { parseItineraries, validQuote } from "./parse";
import { robotsVerdict } from "./robots";
import type { CollectCell, CollectResult, SourceAdapter } from "./types";

export function defineHtmlSource(spec: {
  id: string;
  carrier: string;
  origin: string;
  path: string;
  sourceRank?: number;
}, http = new PoliteHttp()): SourceAdapter {
  const rank = spec.sourceRank ?? 20;
  const skipped = skippedHost(new URL(spec.origin).hostname);
  return {
    id: spec.id,
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
      const url = new URL(spec.path, spec.origin);
      url.searchParams.set("from", cell.origin);
      url.searchParams.set("to", cell.destination);
      url.searchParams.set("date", cell.depDate);
      url.searchParams.set("trip", cell.tripType);
      const href = url.toString();
      const verdict = await robotsVerdict(href, http, (a) => attempts.push(a));
      if (verdict.verdict !== "allow") return outcome("blocked_robots", verdict.notes);
      const res = await http.request(href, (a) => attempts.push(a));
      if (CHALLENGE.test(res.text)) return outcome("blocked", "challenge_page");
      if ([401, 403].includes(res.status) || (res.status >= 300 && res.status < 400)) return outcome("blocked", res.error);
      if (res.transient || res.status === 0 || res.status >= 400) return outcome("error", res.error);
      if (/sold[ -]?out|no seats available/i.test(res.text)) return outcome("sold_out", "sold_out");
      const legs = parseItineraries(res.text);
      const quotes = legs
        .map((leg) => ({
          source: spec.id,
           origin: cell.origin,
           destination: cell.destination,
          carrier: spec.carrier,
          flight_no: leg.flight_no,
           dep_date: cell.depDate,
           trip_type: cell.tripType,
          fare_class: leg.fare_class,
           lead_time_days: cell.leadTimeDays,
          total_fare: leg.total_fare,
          status: "ok",
        }))
        .filter((q) => validQuote(q));
      if (!quotes.length) {
        return outcome("missing", "no_itinerary");
      }
      return outcome("ok", "", quotes);
    },
  };
}
