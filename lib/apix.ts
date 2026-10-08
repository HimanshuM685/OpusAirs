import { APIX_BASE_DATE, loadBasket } from "./bootstrap";
import type { sql as sqlFn } from "./db";
import { isoDate } from "./db";
import { compileIndex, type FarePoint } from "./index-math";
import { buildSnapshots, type SnapshotOptions } from "./snapshot";
import { catalogRoutes } from "./collect/catalog";

export { jevons } from "./index-math";

export async function constructIndex(q: ReturnType<typeof sqlFn>, options: SnapshotOptions = {}): Promise<number> {
  await buildSnapshots(q, options);
  const snaps = (await q`
    SELECT DISTINCT ON (origin, destination, lead_time_bin, collected_on)
      origin, destination, lead_time_bin, total_fare, collected_on, is_imputed, is_synthetic
    FROM quote_snapshots WHERE fare_class = 'ECONOMY' AND trip_type = 'one_way' AND total_fare > 0
      AND (${options.includeSynthetic === true} OR is_synthetic = false)
    ORDER BY origin, destination, lead_time_bin, collected_on, snapshot_at DESC
  `) as {
    origin: string;
    destination: string;
    lead_time_bin: number;
    total_fare: number;
    collected_on: string;
    is_imputed: number;
    is_synthetic: boolean;
  }[];
  await q`DELETE FROM index_values`;
  const points: FarePoint[] = snaps.map((r) => ({
    origin: r.origin,
    destination: r.destination,
    day: isoDate(r.collected_on),
    lead: Number(r.lead_time_bin),
    fare: Number(r.total_fare),
    imputed: Boolean(r.is_imputed),
    synthetic: r.is_synthetic,
  }));
  const basket = await loadBasket(q);
  const rows = compileIndex(points, basket, APIX_BASE_DATE);
  const nationalPairs = new Set(basket.map((r) => `${r.origin}|${r.destination}`));
  const extras = new Map((await catalogRoutes(q)).filter((r) => !nationalPairs.has(`${r.origin}|${r.destination}`))
    .map((r) => [`${r.origin}|${r.destination}`, r]));
  for (const route of extras.values()) {
    rows.push(...compileIndex(points, [{ ...route, weight: 1 }], APIX_BASE_DATE).filter((r) => r.series === "apix_route"));
  }
  for (const row of rows) {
    await q`
      INSERT INTO index_values (
        series, frequency, period_date, origin, destination, value, imputed_share, coverage, vintage, n_routes, n_quotes, quality
      ) VALUES (
        ${row.series}, ${row.frequency}, ${row.period}, ${row.origin}, ${row.destination},
        ${row.value}, ${row.imputed_share}, ${row.coverage}, ${row.vintage}, ${row.n_routes}, ${row.n_quotes}, ${row.quality}
      )
    `;
    if (!row.origin) {
      await q`
        INSERT INTO index_revisions (series, frequency, period_date, vintage, value, imputed_share, coverage)
        VALUES (
          ${row.series}, ${row.frequency}, ${row.period}, ${row.vintage}, ${row.value}, ${row.imputed_share}, ${row.coverage}
        )
        ON CONFLICT (series, frequency, period_date, vintage) DO UPDATE SET
          value = EXCLUDED.value,
          imputed_share = EXCLUDED.imputed_share,
          coverage = EXCLUDED.coverage,
          published_at = NOW()
      `;
    }
  }
  return rows.length;
}
