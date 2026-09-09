import { APIX_BASE_DATE, LEAD_TIMES, loadPsdBasket } from "./bootstrap";
import { lowestEconomyCells } from "./cleaning";
import type { sql as sqlFn } from "./db";
import { isoDate } from "./db";

export function jevons(values: number[]): number | null {
  const positives = values.filter((v) => v > 0);
  if (!positives.length) return null;
  const logMean = positives.reduce((s, v) => s + Math.log(v), 0) / positives.length;
  return Math.exp(logMean);
}

function weekEndingWednesday(d: Date): string {
  const day = d.getUTCDay(); // 0 Sun
  const wednesday = 3;
  const delta = (wednesday - day + 7) % 7;
  const out = new Date(d);
  out.setUTCDate(out.getUTCDate() + delta);
  return out.toISOString().slice(0, 10);
}

function monthStart(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-01`;
}

function parseDay(s: string): Date {
  return new Date(`${s}T00:00:00Z`);
}

export async function constructIndex(q: ReturnType<typeof sqlFn>): Promise<number> {
  const basket = loadPsdBasket();
  const cells = await lowestEconomyCells(q);
  await q`DELETE FROM index_values`;
  if (!cells.size) return 0;

  const dates = [...new Set([...cells.keys()].map((k) => k.split("|")[2]))].sort();
  const base = APIX_BASE_DATE;
  const baseWindow = dates.filter((d) => d >= base).slice(0, 7);
  const window = baseWindow.length ? baseWindow : dates.slice(0, 7);

  const carry = new Map<string, number>();
  const dailyRoute = new Map<string, Map<string, { price: number; share: number }>>();

  for (const day of dates) {
    const dayMap = new Map<string, { price: number; share: number }>();
    for (const route of basket) {
      const observed: number[] = [];
      let missing = 0;
      for (const lt of LEAD_TIMES) {
        const ck = `${route.origin}|${route.destination}|${day}|${lt}`;
        const rk = `${route.origin}|${route.destination}|${lt}`;
        let val = cells.get(ck);
        if (val == null) {
          val = carry.get(rk);
          if (val == null) {
            missing += 1;
            continue;
          }
        } else {
          carry.set(rk, val);
        }
        observed.push(val);
      }
      const price = jevons(observed);
      if (price != null) {
        dayMap.set(`${route.origin}|${route.destination}`, {
          price,
          share: missing / LEAD_TIMES.length,
        });
      }
    }
    dailyRoute.set(day, dayMap);
  }

  const basePrices = new Map<string, number>();
  for (const route of basket) {
    const key = `${route.origin}|${route.destination}`;
    const series = window
      .map((d) => dailyRoute.get(d)?.get(key)?.price)
      .filter((v): v is number => v != null);
    const p0 = series.length ? jevons(series) : null;
    if (p0) basePrices.set(key, p0);
  }

  let n = 0;
  async function add(
    series: string,
    frequency: string,
    period: string,
    value: number,
    imputed: number,
    origin: string | null = null,
    destination: string | null = null,
  ) {
    await q`
      INSERT INTO index_values (series, frequency, period_date, origin, destination, value, imputed_share)
      VALUES (${series}, ${frequency}, ${period}, ${origin}, ${destination}, ${Math.round(value * 10000) / 10000}, ${Math.round(imputed * 10000) / 10000})
    `;
    n += 1;
  }

  const dailyNational = new Map<string, number>();
  for (const day of dates) {
    let laspNum = 0;
    let laspDen = 0;
    const jevonsRels: number[] = [];
    let t21Num = 0;
    let t21Den = 0;
    let imputedW = 0;
    const dayMap = dailyRoute.get(day)!;
    for (const route of basket) {
      const key = `${route.origin}|${route.destination}`;
      const cell = dayMap.get(key);
      const p0 = basePrices.get(key);
      if (!cell || !p0) continue;
      const rel = cell.price / p0;
      await add("apix_route", "daily", day, 100 * rel, cell.share, route.origin, route.destination);
      laspNum += route.weight * rel;
      laspDen += route.weight;
      jevonsRels.push(rel);
      imputedW += route.weight * cell.share;
      const t21 =
        cells.get(`${route.origin}|${route.destination}|${day}|21`) ??
        carry.get(`${route.origin}|${route.destination}|21`);
      if (t21) {
        t21Num += route.weight * (t21 / p0);
        t21Den += route.weight;
      }
    }
    if (laspDen > 0) {
      const lasp = (100 * laspNum) / laspDen;
      dailyNational.set(day, lasp);
      await add("apix_laspeyres", "daily", day, lasp, imputedW);
    }
    if (jevonsRels.length) {
      const j = jevons(jevonsRels);
      if (j != null) await add("apix_jevons", "daily", day, 100 * j, imputedW);
    }
    if (t21Den > 0) await add("apix_t21", "daily", day, (100 * t21Num) / t21Den, 0);
  }

  async function rollup(freq: string, bucket: (d: Date) => string) {
    const buckets = new Map<string, number[]>();
    for (const [day, val] of dailyNational) {
      const p = bucket(parseDay(day));
      const list = buckets.get(p) ?? [];
      list.push(val);
      buckets.set(p, list);
    }
    for (const [period, vals] of [...buckets.entries()].sort()) {
      await add("apix_laspeyres", freq, period, vals.reduce((a, b) => a + b, 0) / vals.length, 0);
    }
    const routeRows = (await q`
      SELECT origin, destination, period_date, value FROM index_values
      WHERE series = 'apix_route' AND frequency = 'daily'
    `) as { origin: string; destination: string; period_date: string; value: number }[];
    const routeBuckets = new Map<string, number[]>();
    for (const r of routeRows) {
      const p = bucket(parseDay(isoDate(r.period_date)));
      const key = `${p}|${r.origin}|${r.destination}`;
      const list = routeBuckets.get(key) ?? [];
      list.push(r.value);
      routeBuckets.set(key, list);
    }
    for (const [key, vals] of routeBuckets) {
      const [period, origin, dest] = key.split("|");
      await add("apix_route", freq, period, vals.reduce((a, b) => a + b, 0) / vals.length, 0, origin, dest);
    }
  }

  await rollup("weekly", weekEndingWednesday);
  await rollup("monthly", monthStart);
  return n;
}
