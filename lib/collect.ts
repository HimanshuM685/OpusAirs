import { readFileSync } from "node:fs";
import { join } from "node:path";
import { constructIndex } from "./apix";
import { loadPsdBasket } from "./bootstrap";
import { cleanQuotes } from "./cleaning";
import { dataDir, sql } from "./db";
import { type CollectionEvent, upsertEvents } from "./ingest";

const INR_RE = /(?:₹|INR)\s*([0-9]{1,3}(?:,[0-9]{2,3})+|[0-9]{3,6})/g;
const CHALLENGE = /captcha|recaptcha|hcaptcha|cf-challenge|verify you are human|access denied|unusual traffic/i;

type Source = {
  id: string;
  enabled?: boolean;
  carrier?: string;
  start_url?: string;
  search_url_template?: string;
};

async function robotsAllowed(url: string): Promise<boolean> {
  try {
    const u = new URL(url);
    const res = await fetch(`${u.origin}/robots.txt`, {
      headers: { "User-Agent": process.env.USER_AGENT || "OpusAirs-APIx-Research/1.0" },
    });
    if (!res.ok) return false;
    const text = await res.text();
    if (/Disallow:\s*\/\s*$/m.test(text) && /User-agent:\s*\*/i.test(text)) {
      const uaStar = text.split(/User-agent:/i);
      const star = uaStar.find((p) => p.trim().startsWith("*"));
      if (star && /Disallow:\s*\//.test(star.split("User-agent:")[0] || star)) return false;
    }
    return true;
  } catch {
    return false;
  }
}

function faresFromHtml(html: string): number[] {
  const found: number[] = [];
  let m: RegExpExecArray | null;
  const re = new RegExp(INR_RE);
  while ((m = re.exec(html))) {
    const n = Number(m[1].replace(/,/g, ""));
    if (n >= 800 && n <= 80000) found.push(n);
  }
  return found;
}

export async function scrapePortals(collectedOn?: string): Promise<CollectionEvent[]> {
  const day = collectedOn || new Date().toISOString().slice(0, 10);
  const cfg = JSON.parse(readFileSync(join(dataDir(), "scrape_sources.json"), "utf8")) as {
    max_searches_per_run?: number;
    lead_times?: number[];
    sources: Source[];
  };
  const routes = loadPsdBasket();
  const leads = cfg.lead_times?.length ? cfg.lead_times : [1, 7, 21];
  const budget = cfg.max_searches_per_run ?? 18;
  const events: CollectionEvent[] = [];
  let searches = 0;
  const ua = process.env.USER_AGENT || "OpusAirs-APIx-Research/1.0 (+https://mospi.gov.in)";

  for (const source of cfg.sources.filter((s) => s.enabled)) {
    if (searches >= budget) break;
    const start = source.start_url || source.search_url_template || "";
    if (start && !(await robotsAllowed(start.split("?")[0]))) {
      events.push(blocked(source, routes[0].origin, routes[0].destination, day, leads[0], "robots.txt"));
      continue;
    }
    for (const route of routes) {
      if (searches >= budget) break;
      for (const lt of leads) {
        if (searches >= budget) break;
        const dep = addDays(day, lt);
        const template = source.search_url_template || source.start_url || "";
        const url = template
          .replace("{origin}", route.origin)
          .replace("{destination}", route.destination)
          .replace("{date}", dep);
        if (!(await robotsAllowed(url))) {
          events.push(blocked(source, route.origin, route.destination, day, lt, "robots.txt"));
          continue;
        }
        searches += 1;
        try {
          const res = await fetch(url, { headers: { "User-Agent": ua }, redirect: "follow" });
          const html = await res.text();
          if (res.status === 401 || res.status === 403 || res.status === 429 || CHALLENGE.test(html)) {
            events.push(blocked(source, route.origin, route.destination, day, lt, "challenge"));
            continue;
          }
          const fares = faresFromHtml(html);
          if (fares.length < 2) {
            events.push(blocked(source, route.origin, route.destination, day, lt, "missing", "missing"));
            continue;
          }
          events.push({
            source: source.id,
            origin: route.origin,
            destination: route.destination,
            carrier: source.carrier || "NA",
            flight_no: "NA",
            dep_date: dep,
            fare_class: "ECONOMY",
            lead_time_days: lt,
            collected_on: day,
            collected_at: new Date().toISOString(),
            status: "ok",
            total_fare: Math.min(...fares),
          });
        } catch (err) {
          events.push(blocked(source, route.origin, route.destination, day, lt, String(err).slice(0, 200)));
        }
        await new Promise((r) => setTimeout(r, Number(process.env.LIVE_RATE_LIMIT_SECONDS || 8) * 1000));
      }
    }
  }
  return events;
}

function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function blocked(
  source: Source,
  origin: string,
  dest: string,
  collected: string,
  lt: number,
  notes: string,
  status = "blocked",
): CollectionEvent {
  return {
    source: source.id,
    origin,
    destination: dest,
    carrier: source.carrier || "NA",
    flight_no: "NA",
    dep_date: addDays(collected, lt),
    fare_class: "ECONOMY",
    lead_time_days: lt,
    collected_on: collected,
    collected_at: new Date().toISOString(),
    status,
    notes,
  } as CollectionEvent;
}

export async function runPipeline(useScrape: boolean) {
  const q = sql();
  const summary: Record<string, number> = {};
  if (useScrape) {
    const events = await scrapePortals();
    const bySrc = new Map<string, CollectionEvent[]>();
    for (const ev of events) {
      const list = bySrc.get(ev.source) ?? [];
      list.push(ev);
      bySrc.set(ev.source, list);
    }
    for (const [src, evs] of bySrc) {
      const started = new Date().toISOString();
      const run = await q`
        INSERT INTO collection_runs (started_at, source, status, quotes_ok, quotes_missing, quotes_sold_out, quotes_blocked, notes)
        VALUES (${started}, ${src}, 'running', 0, 0, 0, 0, '') RETURNING id
      `;
      const counts = await upsertEvents(q, evs, Number(run[0].id));
      await q`
        UPDATE collection_runs SET finished_at = ${new Date().toISOString()}, status = 'ok',
          quotes_ok = ${counts.ok ?? 0}, quotes_missing = ${counts.missing ?? 0},
          quotes_sold_out = ${counts.sold_out ?? 0}, quotes_blocked = ${counts.blocked ?? 0},
          notes = ${`inserted=${counts.inserted} updated=${counts.updated}`}
        WHERE id = ${run[0].id}
      `;
    }
    summary.portals = events.length;
  }
  const cleaned = await cleanQuotes(q);
  const indexed = await constructIndex(q);
  return { collected: summary, cleaned, index_rows: indexed };
}
