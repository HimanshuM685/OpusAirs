import type { sql as sqlFn } from "../../db";
import type { QuoteIn } from "../../ingest";
import type { SourceAdapter } from "../types";

export function manual(q: ReturnType<typeof sqlFn>, day: string): SourceAdapter {
  return {
    id: "manual", sourceRank: 40, kind: "manual", enabled: () => true,
    allowedPath: async () => false,
    async collect(cell) {
      const quotes = (await q`
        SELECT * FROM quotes_raw WHERE source IN ('manual', 'csv') AND status = 'ok'
          AND origin = ${cell.origin} AND destination = ${cell.destination} AND dep_date = ${cell.depDate}
          AND collected_on = ${day} AND UPPER(fare_class) = 'ECONOMY' AND trip_type = 'one_way'
          AND total_fare > 0
      `) as QuoteIn[];
      return { source: "manual", sourceRank: 40, status: quotes.length ? "ok" : "missing", quotes, notes: quotes.length ? "operator_ingest" : "awaiting_operator_ingest" };
    },
  };
}
