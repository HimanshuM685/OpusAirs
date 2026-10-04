import type { sql as sqlFn } from "../../db";
import { akasa } from "./akasa";
import { airindia } from "./airindia";
import { airindiaExpress } from "./airindia_express";
import { indigo } from "./indigo";
import { spicejet } from "./spicejet";
import type { SourceAdapter } from "../types";
import { PoliteHttp, sharedHttp } from "../http";
import { manual } from "./manual";
import { fileDrop } from "./file_drop";
import { syntheticDemo } from "./synthetic_demo";

export function collectors(q: ReturnType<typeof sqlFn>, day: string, http: PoliteHttp = sharedHttp()): SourceAdapter[] {
  return [manual(q, day), fileDrop(day), syntheticDemo, indigo, airindia(http), airindiaExpress(http), akasa(http), spicejet(http)];
}

export function selectAdapters(all: SourceAdapter[], enabledIds: Set<string>, live = process.env.SCRAPE_ENABLED === "true", demo = false): SourceAdapter[] {
  return all.filter((a) => enabledIds.has(a.id) && a.enabled() && a.kind !== "skip"
    && (live || (a.kind !== "html" && a.kind !== "api")) && (a.kind !== "demo" || demo));
}

export async function enabledCollectors(q: ReturnType<typeof sqlFn>, day: string, demo = false): Promise<SourceAdapter[]> {
  const rows = (await q`SELECT id FROM scrape_sources WHERE enabled = true`) as { id: string }[];
  // An empty selection means disabled, never an implicit fallback to all portals.
  return selectAdapters(collectors(q, day), new Set(rows.map((r) => r.id)), undefined, demo);
}
