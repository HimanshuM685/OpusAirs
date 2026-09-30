export const LEAD_BINS = [1, 7, 15, 21, 30, 45] as const;

export type BasketW = { origin: string; destination: string; weight: number };

export type FarePoint = {
  origin: string;
  destination: string;
  day: string;
  lead: number;
  fare: number;
};

export type IndexPoint = {
  series: string;
  frequency: "daily" | "weekly" | "monthly";
  period: string;
  origin: string | null;
  destination: string | null;
  value: number;
  imputed_share: number;
  coverage: number;
  vintage: "provisional" | "final";
  n_routes: number;
  n_quotes: number;
};

export function jevons(values: number[]): number | null {
  const positives = values.filter((v) => v > 0);
  if (!positives.length) return null;
  return Math.exp(positives.reduce((s, v) => s + Math.log(v), 0) / positives.length);
}

export function nearestBin(lead: number): number {
  return LEAD_BINS.reduce((best, bin) =>
    Math.abs(bin - lead) < Math.abs(best - lead) ? bin : best,
  );
}

export function economyOneWay<T extends { fare_class?: string; trip_type?: string }>(rows: T[]): T[] {
  return rows.filter(
    (r) => (r.fare_class || "ECONOMY").toUpperCase() === "ECONOMY" && (r.trip_type || "one_way") === "one_way",
  );
}

function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}

function dayOffset(day: string, delta: number): string {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}

function median(values: number[]): number | null {
  if (!values.length) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

type Cell = { fare: number; imputed: boolean; method: string | null };

function fillDay(
  day: string,
  days: string[],
  observed: Map<string, number>,
  basket: BasketW[],
): Map<string, Cell> {
  const out = new Map<string, Cell>();
  const observedFares: number[] = [];
  for (const route of basket) {
    for (const lead of LEAD_BINS) {
      const key = `${route.origin}|${route.destination}|${lead}`;
      const fare = observed.get(`${key}|${day}`);
      if (fare != null) {
        out.set(key, { fare, imputed: false, method: null });
        observedFares.push(fare);
      }
    }
  }
  for (const route of basket) {
    const have = new Map<number, number>();
    for (const lead of LEAD_BINS) {
      const cell = out.get(`${route.origin}|${route.destination}|${lead}`);
      if (cell && !cell.imputed) have.set(lead, cell.fare);
    }
    for (const lead of LEAD_BINS) {
      const key = `${route.origin}|${route.destination}|${lead}`;
      if (out.has(key)) continue;
      if (have.size) {
        const bins = [...have.keys()].sort((a, b) => Math.abs(a - lead) - Math.abs(b - lead));
        out.set(key, { fare: have.get(bins[0]) as number, imputed: true, method: "adjacent_lead" });
        continue;
      }
      for (let back = 1; back <= 7; back++) {
        const prev = dayOffset(day, -back);
        if (!days.includes(prev)) continue;
        const fare = observed.get(`${key}|${prev}`);
        if (fare != null) {
          out.set(key, { fare, imputed: true, method: "carry_forward" });
          break;
        }
      }
    }
  }
  const mid = median(observedFares);
  if (mid != null) {
    for (const route of basket) {
      for (const lead of LEAD_BINS) {
        const key = `${route.origin}|${route.destination}|${lead}`;
        if (!out.has(key)) out.set(key, { fare: mid, imputed: true, method: "route_median" });
      }
    }
  }
  return out;
}

export function chainStep(
  prevIndex: number,
  basket: BasketW[],
  now: Map<string, number>,
  prev: Map<string, number>,
): number {
  let num = 0;
  let den = 0;
  for (const route of basket) {
    const key = `${route.origin}|${route.destination}`;
    const a = now.get(key);
    const b = prev.get(key);
    if (a == null || b == null || b === 0) continue;
    num += route.weight * (a / b);
    den += route.weight;
  }
  if (den === 0) return prevIndex;
  return prevIndex * (num / den);
}

function weekEndingWednesday(day: string): string {
  const d = new Date(`${day}T00:00:00Z`);
  const delta = (3 - d.getUTCDay() + 7) % 7;
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}

function monthStart(day: string): string {
  return `${day.slice(0, 7)}-01`;
}

export function compileIndex(points: FarePoint[], basket: BasketW[], baseDate: string): IndexPoint[] {
  if (!basket.length) return [];
  const observed = new Map<string, number>();
  for (const p of points) {
    if (!(p.fare > 0)) continue;
    const lead = nearestBin(p.lead);
    const key = `${p.origin}|${p.destination}|${lead}|${p.day}`;
    const prev = observed.get(key);
    if (prev == null || p.fare < prev) observed.set(key, p.fare);
  }
  const days = [...new Set(points.map((p) => p.day))].sort();
  if (!days.length) return [];

  const routePrice = new Map<string, number>();
  const daily: {
    day: string;
    laspeyres: number;
    jevons: number | null;
    t21: number | null;
    timing: number | null;
    imputed_share: number;
    coverage: number;
    vintage: "provisional" | "final";
    n_routes: number;
    n_quotes: number;
    routes: { origin: string; destination: string; rel: number; share: number; weight: number }[];
  }[] = [];

  const baseWindow = days.filter((d) => d >= baseDate).slice(0, 7);
  const window = baseWindow.length ? baseWindow : days.slice(0, 7);
  const baseSums = new Map<string, number[]>();

  const priced: { day: string; cells: Map<string, Cell>; elementary: Map<string, { price: number; share: number }> }[] = [];
  for (const day of days) {
    const cells = fillDay(day, days, observed, basket);
    const elementary = new Map<string, { price: number; share: number }>();
    for (const route of basket) {
      const fares: number[] = [];
      let imputed = 0;
      for (const lead of LEAD_BINS) {
        const cell = cells.get(`${route.origin}|${route.destination}|${lead}`);
        if (!cell) continue;
        fares.push(cell.fare);
        if (cell.imputed) imputed += 1;
      }
      const price = jevons(fares);
      if (price == null) continue;
      elementary.set(`${route.origin}|${route.destination}`, { price, share: imputed / LEAD_BINS.length });
      if (window.includes(day)) {
        const list = baseSums.get(`${route.origin}|${route.destination}`) ?? [];
        list.push(price);
        baseSums.set(`${route.origin}|${route.destination}`, list);
      }
    }
    priced.push({ day, cells, elementary });
  }

  const basePrices = new Map<string, number>();
  for (const route of basket) {
    const key = `${route.origin}|${route.destination}`;
    const p0 = jevons(baseSums.get(key) ?? []);
    if (p0) basePrices.set(key, p0);
  }

  for (const { day, cells, elementary } of priced) {
    let laspNum = 0;
    let laspDen = 0;
    let t21Num = 0;
    let t21Den = 0;
    let timeNum = 0;
    let timeDen = 0;
    let imputedW = 0;
    let observedW = 0;
    let cellW = 0;
    const rels: number[] = [];
    const routes: { origin: string; destination: string; rel: number; share: number; weight: number }[] = [];
    let nQuotes = 0;
    for (const route of basket) {
      const key = `${route.origin}|${route.destination}`;
      const cell = elementary.get(key);
      const p0 = basePrices.get(key);
      cellW += route.weight;
      if (!cell || !p0) continue;
      const rel = cell.price / p0;
      laspNum += route.weight * rel;
      laspDen += route.weight;
      imputedW += route.weight * cell.share;
      observedW += route.weight * (1 - cell.share);
      rels.push(rel);
      routes.push({ origin: route.origin, destination: route.destination, rel, share: cell.share, weight: route.weight });
      routePrice.set(`${day}|${key}`, cell.price);
      for (const lead of LEAD_BINS) if (cells.get(`${key}|${lead}`)) nQuotes += 1;
      const t1 = cells.get(`${key}|1`);
      const t21 = cells.get(`${key}|21`) ?? cells.get(`${key}|15`) ?? cells.get(`${key}|30`);
      if (t21) {
        t21Num += route.weight * (t21.fare / p0);
        t21Den += route.weight;
      }
      if (t1 && t21 && t21.fare > 0) {
        timeNum += route.weight * (t1.fare / t21.fare);
        timeDen += route.weight;
      }
    }
    if (laspDen <= 0) continue;
    const coverage = cellW > 0 ? observedW / cellW : 0;
    daily.push({
      day,
      laspeyres: (100 * laspNum) / laspDen,
      jevons: jevons(rels),
      t21: t21Den > 0 ? (100 * t21Num) / t21Den : null,
      timing: timeDen > 0 ? (100 * timeNum) / timeDen : null,
      imputed_share: cellW > 0 ? imputedW / cellW : 0,
      coverage,
      vintage: coverage < 0.6 ? "provisional" : "final",
      n_routes: routes.length,
      n_quotes: nQuotes,
      routes,
    });
  }

  if (!daily.length) return [];
  const anchor = daily.find((d) => d.day >= baseDate) ?? daily[0];
  const scale = anchor.laspeyres === 0 ? 1 : 100 / anchor.laspeyres;
  const rows: IndexPoint[] = [];
  const push = (row: Omit<IndexPoint, "value"> & { value: number }) => {
    rows.push({ ...row, value: round4(row.value) });
  };
  for (const d of daily) {
    const lasp = d.laspeyres * scale;
    const common = {
      frequency: "daily" as const,
      period: d.day,
      origin: null,
      destination: null,
      imputed_share: round4(d.imputed_share),
      coverage: round4(d.coverage),
      vintage: d.vintage,
      n_routes: d.n_routes,
      n_quotes: d.n_quotes,
    };
    push({ ...common, series: "apix_laspeyres", value: lasp });
    push({ ...common, series: "apix_economy", value: lasp });
    push({ ...common, series: "apix_lowe", value: lasp });
    if (d.jevons != null) push({ ...common, series: "apix_jevons", value: 100 * d.jevons * scale });
    if (d.t21 != null) push({ ...common, series: "apix_t21", value: d.t21 * scale });
    if (d.timing != null) push({ ...common, series: "apix_fare_timing", value: d.timing });
    for (const route of d.routes) {
      push({
        series: "apix_route",
        frequency: "daily",
        period: d.day,
        origin: route.origin,
        destination: route.destination,
        value: 100 * route.rel * scale,
        imputed_share: round4(route.share),
        coverage: round4(1 - route.share),
        vintage: d.vintage,
        n_routes: 1,
        n_quotes: d.n_quotes,
      });
    }
  }

  const laspDaily = rows.filter((r) => r.series === "apix_laspeyres" && r.frequency === "daily");
  for (let i = 0; i < laspDaily.length; i++) {
    const slice = laspDaily.slice(Math.max(0, i - 6), i + 1).map((r) => r.value);
    const ma = jevons(slice);
    if (ma == null) continue;
    push({ ...laspDaily[i], series: "apix_laspeyres_ma7", value: ma });
  }

  function roll(freq: "weekly" | "monthly", bucket: (day: string) => string) {
    const groups = new Map<string, IndexPoint[]>();
    for (const row of rows.filter((r) => r.frequency === "daily" && r.origin == null && r.series !== "apix_laspeyres_ma7")) {
      const key = `${row.series}|${bucket(row.period)}`;
      const list = groups.get(key) ?? [];
      list.push(row);
      groups.set(key, list);
    }
    for (const [key, list] of groups) {
      const [series, period] = key.split("|");
      const value = list.reduce((s, r) => s + r.value, 0) / list.length;
      push({
        series,
        frequency: freq,
        period,
        origin: null,
        destination: null,
        value,
        imputed_share: list.reduce((s, r) => s + r.imputed_share, 0) / list.length,
        coverage: list.reduce((s, r) => s + r.coverage, 0) / list.length,
        vintage: list.some((r) => r.vintage === "provisional") ? "provisional" : "final",
        n_routes: Math.max(...list.map((r) => r.n_routes)),
        n_quotes: list.reduce((s, r) => s + r.n_quotes, 0),
      });
    }
  }
  roll("weekly", weekEndingWednesday);
  roll("monthly", monthStart);

  const months = rows
    .filter((r) => r.series === "apix_laspeyres" && r.frequency === "monthly")
    .sort((a, b) => (a.period < b.period ? -1 : 1));
  const monthDays = new Map<string, string[]>();
  for (const d of daily) {
    const m = monthStart(d.day);
    const list = monthDays.get(m) ?? [];
    list.push(d.day);
    monthDays.set(m, list);
  }
  let chain = 100;
  let prevPrices = new Map<string, number>();
  for (const month of months) {
    const lastDay = (monthDays.get(month.period) ?? []).sort().at(-1);
    const nowPrices = new Map<string, number>();
    if (lastDay) {
      for (const route of basket) {
        const key = `${route.origin}|${route.destination}`;
        const price = routePrice.get(`${lastDay}|${key}`);
        if (price != null) nowPrices.set(key, price);
      }
    }
    if (prevPrices.size) chain = chainStep(chain, basket, nowPrices, prevPrices);
    push({ ...month, series: "apix_chain", value: chain });
    prevPrices = nowPrices;
  }
  return rows;
}
