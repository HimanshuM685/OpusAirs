import { APIX_BASE_DATE, loadPsdBasket } from "./bootstrap";
import type { sql as sqlFn } from "./db";
import { isoDate } from "./db";
import { compileIndex, type FarePoint } from "./index-math";
import { buildSnapshots, slotForNow } from "./snapshot";

export { jevons } from "./index-math";

export async function constructIndex(q: ReturnType<typeof sqlFn>): Promise<number> {
  await buildSnapshots(q, slotForNow());
  const snaps = (await q`
    SELECT origin, destination, lead_time_bin, total_fare, collected_on
    FROM quote_snapshots
    WHERE fare_class = 'ECONOMY' AND trip_type = 'one_way'
  `) as {
    origin: string;
    destination: string;
    lead_time_bin: number;
    total_fare: number;
    collected_on: string;
  }[];
  await q`DELETE FROM index_values`;
  const points: FarePoint[] = snaps.map((r) => ({
    origin: r.origin,
    destination: r.destination,
    day: isoDate(r.collected_on),
    lead: Number(r.lead_time_bin),
    fare: Number(r.total_fare),
  }));
  const rows = compileIndex(points, loadPsdBasket(), APIX_BASE_DATE);
  for (const row of rows) {
    await q`
      INSERT INTO index_values (
        series, frequency, period_date, origin, destination, value, imputed_share, coverage, vintage, n_routes, n_quotes
      ) VALUES (
        ${row.series}, ${row.frequency}, ${row.period}, ${row.origin}, ${row.destination},
        ${row.value}, ${row.imputed_share}, ${row.coverage}, ${row.vintage}, ${row.n_routes}, ${row.n_quotes}
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
