import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { bootstrap, loadPsdBasket } from "../bootstrap";
import { dataDir } from "../db";
import type { sql as sqlFn } from "../db";
import { CollectBudget } from "./budget";
import { parseSchedule, type CatalogRoute } from "./catalog";
import { collectors } from "./sources";
import { istDate } from "./policy";
import { acquireLock, releaseLock } from "./jobs";
import { TinyfishApi } from "./tinyfish";
import { loadAirports } from "./airports";

export function parseRouteMap(html: string, carrier: string): CatalogRoute[] {
  const airports = loadAirports();
  const rows = new Map<string, CatalogRoute>();
  for (const match of html.matchAll(/<[^>]+data-origin=["']([A-Z]{3})["'][^>]*data-destination=["']([A-Z]{3})["'][^>]*>/gi)) {
    const origin = match[1].toUpperCase(); const destination = match[2].toUpperCase();
    if (origin === destination || !airports.has(origin) || !airports.has(destination)) continue;
    rows.set(`${origin}|${destination}`, { origin, destination, carrier, flight_no: "", dow_mask: 127, active: true, source: "observed" });
  }
  return [...rows.values()];
}
export async function upsertCatalog(q: ReturnType<typeof sqlFn>, rows: CatalogRoute[], day: string): Promise<number> {
  if (!rows.length) return 0;
  await q`INSERT INTO route_catalog (origin, destination, carrier, flight_no, dow_mask, active, source, refreshed_on)
    SELECT x.origin, x.destination, x.carrier, x.flight_no, x.dow_mask, true, x.source, ${day}::date
    FROM jsonb_to_recordset(${JSON.stringify(rows)}::jsonb) AS x(origin text, destination text, carrier text, flight_no text, dow_mask int, source text)
    ON CONFLICT (origin, destination, carrier, flight_no) DO UPDATE SET dow_mask = EXCLUDED.dow_mask,
      active = true, source = EXCLUDED.source, refreshed_on = EXCLUDED.refreshed_on`;
  return rows.length;
}

export async function discoverRoutes(q: ReturnType<typeof sqlFn>, runId: string = randomUUID(), day = istDate(), shutdown?: AbortSignal) {
  await bootstrap(q);
  const owner = randomUUID();
  if (await acquireLock(q, 5 / 60, owner) === "busy") throw new Error("Collection lock busy; worker will retry queued job");
  const heartbeat = setInterval(() => { void q`UPDATE collect_lock SET started_at = NOW() WHERE owner = ${owner}`.catch(console.error); }, 30000);
  heartbeat.unref();
  try {
    let rows = 0;
    for (const route of loadPsdBasket()) {
      await q`INSERT INTO route_catalog (origin, destination, carrier, flight_no, source, refreshed_on)
        VALUES (${route.origin}, ${route.destination}, 'NA', '', 'schedule_file', ${day})
        ON CONFLICT (origin, destination, carrier, flight_no) DO NOTHING`;
    }
    try { rows = await upsertCatalog(q, parseSchedule(await readFile(join(dataDir(), "drops", "schedule.csv"), "utf8")), day); }
    catch (err) { if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err; }
    if (process.env.DISCOVER_WITH_BROWSER === "true") {
      const budget = await new CollectBudget(q, runId).init();
      await new TinyfishApi(budget).recover();
      const signal = AbortSignal.any([AbortSignal.timeout(3 * 3600000), ...(shutdown ? [shutdown] : [])]);
      for (const a of collectors(q, day).filter((a) => a.carrier && a.kind !== "skip")) {
        if (signal.aborted) break;
        // No guessed discovery URLs. Operators explicitly configure a permitted public timetable/map path.
        const path = process.env[`DISCOVER_${a.id.toUpperCase()}_PATH`];
        if (!path || !path.startsWith("/") || path.startsWith("//")) continue;
        let found: CatalogRoute[] = [];
        const discovery = { ...a, searchPath: path, searchUrl: () => `https://${a.host}${path}`,
          parseHtml: (html: string) => { found = parseRouteMap(html, a.carrier!); return { source: a.id, sourceRank: a.sourceRank, status: "missing" as const, quotes: [] }; } };
        const { collectBrowser } = await import("./sources/tinyfish-browser");
        await collectBrowser(discovery, [{ origin: "DEL", destination: "BOM", depDate: day, leadTimeDays: 0, fareClass: "ECONOMY", tripType: "one_way" }], budget,
          async () => { rows += await upsertCatalog(q, found, day); }, signal);
      }
    }
    return { routes_upserted: rows, refreshed_on: day, index_rebuilt: false };
  } finally { clearInterval(heartbeat); await releaseLock(q, owner); }
}
