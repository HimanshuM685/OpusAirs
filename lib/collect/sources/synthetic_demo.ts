import type { SourceAdapter } from "../types";

export const syntheticDemo: SourceAdapter = {
  id: "synthetic_demo", sourceRank: 100, kind: "demo",
  enabled: () => process.env.SYNTHETIC_DEMO_ENABLED === "true",
  allowedPath: async () => false,
  async collect(cell) {
    let hash = 2166136261;
    for (const c of `${cell.origin}|${cell.destination}|${cell.depDate}`) hash = Math.imul(hash ^ c.charCodeAt(0), 16777619) >>> 0;
    return {
      source: "synthetic", sourceRank: 100, status: "ok", notes: "synthetic_demo_not_an_observation",
      quotes: [{ source: "synthetic", origin: cell.origin, destination: cell.destination, carrier: ["6E", "AI", "IX", "QP", "SG"][hash % 5],
        flight_no: "DEMO", dep_date: cell.depDate, lead_time_days: cell.leadTimeDays, fare_class: "ECONOMY", trip_type: "one_way",
        total_fare: 3000 + hash % 4000 + (45 - cell.leadTimeDays) * 35, status: "ok", notes: "synthetic_demo_not_an_observation" }],
    };
  },
};
