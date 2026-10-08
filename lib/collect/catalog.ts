import { loadBasket } from "../bootstrap";
import type { sql as sqlFn } from "../db";
import { loadAirports } from "./airports";

export type CatalogRoute = { origin: string; destination: string; carrier: string; flight_no: string; dow_mask: number; active: boolean; source?: string };
export const CARRIERS = ["6E", "AI", "IX", "QP", "SG"];

export function parseSchedule(text: string, airports = loadAirports()): CatalogRoute[] {
  const lines = text.replace(/^\uFEFF/, "").trim().split(/\r?\n/);
  const headers = lines.shift()?.split(",").map((h) => h.trim()) || [];
  if (!["origin", "destination", "carrier"].every((h) => headers.includes(h))) throw new Error("schedule.csv requires origin,destination,carrier");
  const rows = new Map<string, CatalogRoute>();
  for (const line of lines.filter((l) => l.trim())) {
    const fields = line.split(",").map((v) => v.trim().replace(/^"|"$/g, ""));
    const value = (key: string) => fields[headers.indexOf(key)] || "";
    const origin = value("origin").toUpperCase(); const destination = value("destination").toUpperCase();
    const carrier = value("carrier").toUpperCase(); const mask = value("dow_mask") ? Number(value("dow_mask")) : 127;
    if (!airports.has(origin) || !airports.has(destination) || origin === destination || !CARRIERS.includes(carrier)
      || !Number.isInteger(mask) || mask < 1 || mask > 127) throw new Error(`Invalid domestic schedule row: ${origin}-${destination} ${carrier}`);
    const flight_no = value("flight_no").toUpperCase();
    rows.set(`${origin}|${destination}|${carrier}|${flight_no}`, { origin, destination, carrier, flight_no, dow_mask: mask, active: true, source: "schedule_file" });
  }
  return [...rows.values()];
}

export async function catalogRoutes(q: ReturnType<typeof sqlFn>): Promise<CatalogRoute[]> {
  const rows = (await q`SELECT * FROM route_catalog WHERE active = true`) as CatalogRoute[];
  const airports = loadAirports();
  return rows.filter((r) => airports.has(r.origin) && airports.has(r.destination) && CARRIERS.includes(r.carrier))
    .map((r) => ({ ...r, dow_mask: Number(r.dow_mask) }));
}

export async function snapshotRoutes(q: ReturnType<typeof sqlFn>) {
  const basket = await loadBasket(q);
  const pairs = new Map(basket.map((r) => [`${r.origin}|${r.destination}`, r]));
  for (const r of await catalogRoutes(q)) {
    if (!pairs.has(`${r.origin}|${r.destination}`)) pairs.set(`${r.origin}|${r.destination}`, { ...r, weight: 0, raw_passengers: 0, note: "catalog_only" });
  }
  return [...pairs.values()];
}
