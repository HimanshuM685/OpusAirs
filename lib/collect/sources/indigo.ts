import type { SourceAdapter } from "../types";

// Policy-only entry, not an HTML collector. Airline fares can arrive through ingest.
export const indigo: SourceAdapter = {
  id: "indigo", sourceRank: 10, kind: "skip", host: "www.goindigo.in",
  skippedReason: "Search-route crawling excluded by policy; use partner feeds or legal operator ingest.",
  enabled: () => false,
  allowedPath: async () => false,
  collect: async () => ({ source: "indigo", sourceRank: 10, status: "blocked_robots", quotes: [], notes: "host_policy_skip" }),
};
