import { readdir, readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { dataDir, isoDate } from "../../db";
import { parseCsvQuotes, type QuoteIn } from "../../ingest";
import type { SourceAdapter } from "../types";

export function fileDrop(day: string): SourceAdapter {
  let loaded: Promise<QuoteIn[]> | undefined;
  const load = async () => {
    const dir = join(dataDir(), "drops");
    let files: string[];
    try { files = await readdir(dir); } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
      throw err;
    }
    const rows: QuoteIn[] = [];
    for (const file of files.sort().filter((f) => f.toLowerCase().endsWith(".csv") && f.toLowerCase() !== "schedule.csv")) {
      const path = join(dir, file);
      const stamp = (await stat(path)).mtime.toISOString();
      rows.push(...parseCsvQuotes(await readFile(path, "utf8")).map((q) => ({ ...q, collected_at: q.collected_at || stamp })));
    }
    return rows;
  };
  return {
    id: "file_drop", sourceRank: 40, kind: "file", enabled: () => true,
    allowedPath: async () => false,
    async collect(cell) {
      loaded ??= load();
      const quotes = (await loaded).filter((q) => q.origin === cell.origin && q.destination === cell.destination
        && isoDate(q.dep_date) === cell.depDate && isoDate(q.collected_on) === day
        && (q.fare_class || "ECONOMY").toUpperCase() === "ECONOMY" && (q.trip_type || "one_way") === "one_way"
        && (q.status || "ok") === "ok" && Number(q.total_fare) > 0)
        .map((q) => ({ ...q, source: "file_drop" }));
      return { source: "file_drop", sourceRank: 40, status: quotes.length ? "ok" : "missing", quotes, notes: quotes.length ? "operator_file_drop" : "no_matching_drop" };
    },
  };
}
