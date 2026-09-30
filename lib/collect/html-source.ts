import { fetchText } from "./http";
import { parseItineraries, validQuote } from "./parse";
import { leadDays } from "./policy";
import { originAllowed } from "./robots";
import type { CollectJob, CollectOutcome, SourceCollector } from "./types";

const CHALLENGE = /captcha|recaptcha|hcaptcha|cf-challenge|verify you are human|access denied|unusual traffic/i;

export function defineHtmlSource(spec: {
  id: string;
  carrier: string;
  origin: string;
  path: string;
}): SourceCollector {
  return {
    id: spec.id,
    carrier: spec.carrier,
    async collect(job: CollectJob): Promise<CollectOutcome> {
      const url = new URL(spec.path, spec.origin);
      url.searchParams.set("from", job.origin);
      url.searchParams.set("to", job.destination);
      url.searchParams.set("date", job.dep_date);
      url.searchParams.set("trip", job.trip_type);
      if (job.return_date) url.searchParams.set("return", job.return_date);
      const href = url.toString();
      const host = url.host;
      const ua = process.env.USER_AGENT || "OpusAirs-APIx-Research/1.0 (+https://mospi.gov.in)";
      if (!(await originAllowed(href, ua))) {
        return { status: "blocked", reason: "robots.txt", host, http: null, quotes: [] };
      }
      const res = await fetchText(href, ua);
      if (res.transient) {
        return { status: "blocked", reason: res.error || "transient", host, http: res.status || null, quotes: [], transient: true };
      }
      if (res.status === 401 || res.status === 403 || res.status === 429 || CHALLENGE.test(res.text)) {
        return { status: "blocked", reason: "challenge", host, http: res.status, quotes: [] };
      }
      const legs = parseItineraries(res.text);
      const quotes = legs
        .map((leg) => ({
          source: spec.id,
          origin: job.origin,
          destination: job.destination,
          carrier: spec.carrier,
          flight_no: leg.flight_no,
          dep_date: job.dep_date,
          return_date: job.return_date,
          trip_type: job.trip_type,
          fare_class: leg.fare_class,
          lead_time_days: leadDays(job.collected_on, job.dep_date),
          collected_on: job.collected_on,
          total_fare: leg.total_fare,
          status: "ok",
        }))
        .filter((q) => validQuote(q));
      if (!quotes.length) {
        return { status: "missing", reason: "no itinerary", host, http: res.status, quotes: [] };
      }
      return { status: "ok", reason: "", host, http: res.status, quotes };
    },
  };
}
