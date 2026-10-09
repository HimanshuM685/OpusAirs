import type { sql as sqlFn } from "../db";
import { collectors } from "./sources";
import { istDate } from "./policy";
import { readCollectionSettings } from "./control";
import { withCollectionSettings } from "./runtime";

// Listing configuration must not contact airline hosts. Robots checks belong to
// the worker, where they are enforced before collection and can be recorded.
export async function collectionSources(q: ReturnType<typeof sqlFn>) {
  const [configured, blocked, settings] = await Promise.all([
    q`SELECT id, enabled FROM scrape_sources`,
    q`SELECT DISTINCT source FROM collect_jobs WHERE status IN ('blocked', 'blocked_robots')
      AND snapshot_at = (SELECT (payload->>'snapshotAt')::timestamptz FROM pipeline_jobs
        WHERE type = 'collect' ORDER BY CASE WHEN status = 'running' THEN 0 ELSE 1 END, created_at DESC LIMIT 1)`,
    readCollectionSettings(q),
  ]);
  return withCollectionSettings(settings, () => {
  const byId = new Map(configured.map((source) => [source.id, source.enabled]));
  const closed = new Set(blocked.map((row) => row.source));
  const sources = collectors(q, istDate()).map((adapter) => {
    const enabled = byId.get(adapter.id) === true;
    const available = enabled && adapter.enabled() && adapter.kind !== "skip" && !closed.has(adapter.id);
    const robots = adapter.kind === "skip"
      ? { verdict: "deny", notes: adapter.skippedReason || "Skipped by collection policy", checked_at: null }
      : closed.has(adapter.id)
        ? { verdict: "blocked", notes: "Host closed for this slot; see collection results. No audit retry.", checked_at: null }
        : !available
          ? { verdict: "disabled", notes: enabled ? "Collection mode or source gate closed" : "Adapter disabled", checked_at: null }
          : adapter.host && adapter.searchPath
            ? { verdict: "pending", notes: "The worker checks robots.txt before collecting fares.", checked_at: null }
            : { verdict: "not_applicable", notes: "Offline source", checked_at: null };
    return { id: adapter.id, kind: adapter.kind, host: adapter.host || null, source_rank: adapter.sourceRank,
      enabled, runnable: available, skipped_reason: adapter.skippedReason || null, robots };
  });
  return { scrape_enabled: settings.transport_mode !== "offline", sources };
  });
}
