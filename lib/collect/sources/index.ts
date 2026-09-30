import type { sql as sqlFn } from "../../db";
import { akasa } from "./akasa";
import { airindia } from "./airindia";
import { airindiaExpress } from "./airindia_express";
import { indigo } from "./indigo";
import { spicejet } from "./spicejet";
import type { SourceCollector } from "../types";

const ALL: SourceCollector[] = [indigo, airindia, airindiaExpress, akasa, spicejet];

export function collectors(): SourceCollector[] {
  return ALL;
}

export async function enabledCollectors(q: ReturnType<typeof sqlFn>): Promise<SourceCollector[]> {
  try {
    const rows = (await q`SELECT id FROM scrape_sources WHERE enabled = true`) as { id: string }[];
    if (rows.length) {
      const ids = new Set(rows.map((r) => r.id));
      const picked = ALL.filter((c) => ids.has(c.id));
      if (picked.length) return picked;
    }
  } catch {
    /* use the registry */
  }
  return ALL;
}
