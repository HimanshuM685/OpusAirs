import { isoDate } from "./db";
import type { sql as sqlFn } from "./db";

function mom(current: number | null, previous: number | null): number | null {
  if (current == null || previous == null || previous === 0) return null;
  return Math.round((1000 * (current - previous)) / previous) / 10;
}

function corr(xs: number[], ys: number[]): number | null {
  const n = xs.length;
  if (n < 2) return null;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let num = 0;
  let dx = 0;
  let dy = 0;
  for (let i = 0; i < n; i++) {
    num += (xs[i] - mx) * (ys[i] - my);
    dx += (xs[i] - mx) ** 2;
    dy += (ys[i] - my) ** 2;
  }
  if (dx === 0 || dy === 0) return null;
  return Math.round((num / Math.sqrt(dx * dy)) * 10000) / 10000;
}

export async function computeBacktest(q: ReturnType<typeof sqlFn>) {
  const apix = (await q`
    SELECT period_date, value FROM index_values
    WHERE series = 'apix_laspeyres' AND frequency = 'monthly' AND origin IS NULL
  `) as { period_date: string; value: number }[];
  const apixBy = new Map(apix.map((r) => [isoDate(r.period_date), r.value]));

  const tmu = (await q`
    SELECT month, value FROM dgca_benchmark WHERE metric = 'tmu_basket_index'
  `) as { month: string; value: number }[];
  const tmuBy = new Map(tmu.map((r) => [isoDate(r.month), r.value]));

  const quotes = (await q`
    SELECT origin, destination, collected_on, total_fare FROM quotes_clean WHERE is_outlier = 0
  `) as { origin: string; destination: string; collected_on: string; total_fare: number }[];
  const routeAvg = new Map<string, number[]>();
  for (const qrow of quotes) {
    const d = isoDate(qrow.collected_on);
    const month = `${d.slice(0, 7)}-01`;
    const key = `${month}|${qrow.origin}|${qrow.destination}`;
    const list = routeAvg.get(key) ?? [];
    list.push(qrow.total_fare);
    routeAvg.set(key, list);
  }

  const dgcaRoute = (await q`
    SELECT month, origin, destination, value FROM dgca_benchmark WHERE metric = 'tmu_route_avg_fare'
  `) as { month: string; origin: string; destination: string; value: number }[];
  const dgcaRouteMap = new Map(
    dgcaRoute.map((r) => [`${isoDate(r.month)}|${r.origin}|${r.destination}`, r.value]),
  );

  const months = [...new Set([...apixBy.keys(), ...tmuBy.keys()])].sort();
  const rows: Record<string, unknown>[] = [];
  let prevApix: number | null = null;
  let prevTmu: number | null = null;
  for (const month of months) {
    const a = apixBy.get(month) ?? null;
    const t = tmuBy.get(month) ?? null;
    rows.push({
      month,
      apix_monthly: a,
      apix_mom_pct: a != null ? mom(a, prevApix) : null,
      dgca_value: t,
      dgca_mom_pct: t != null ? mom(t, prevTmu) : null,
    });
    if (a != null) prevApix = a;
    if (t != null) prevTmu = t;
  }

  for (const [key, fares] of [...routeAvg.entries()].sort()) {
    const [month, origin, dest] = key.split("|");
    const avg = fares.reduce((a, b) => a + b, 0) / fares.length;
    rows.push({
      month,
      origin,
      destination: dest,
      route_avg_fare: Math.round(avg * 100) / 100,
      dgca_route_avg: dgcaRouteMap.get(key) ?? null,
    });
  }

  const published = (await q`
    SELECT month, value FROM dgca_benchmark WHERE metric = 'tmu_72_route_index'
  `) as { month: string; value: number }[];
  for (const r of published) {
    rows.push({ month: isoDate(r.month), dgca_value: r.value });
  }

  const paired = rows.filter(
    (r) => r.origin == null && r.apix_monthly != null && r.dgca_value != null,
  ) as { apix_monthly: number; dgca_value: number }[];

  return {
    correlation: corr(
      paired.map((r) => r.apix_monthly),
      paired.map((r) => r.dgca_value),
    ),
    n_pairs: paired.length,
    note: "Monthly APIx vs published DGCA TMU 72-route composite. Quotes live in Neon.",
    rows,
  };
}
