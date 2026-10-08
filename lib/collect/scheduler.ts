import { istDate } from "./policy";
import { snapshotStamp } from "../snapshot";
import { enqueue } from "../jobs";
import type { sql as sqlFn } from "../db";

export function dueSnapshots(now = new Date(), hours = process.env.SNAPSHOT_HOURS || "6") {
  const day = istDate(now);
  return [...new Set(hours.split(",").map(Number))].filter((h) => h === 6 || h === 18)
    .map((h) => ({ day, slot: h === 6 ? "0600" : "1800", snapshotAt: snapshotStamp(day, h === 6 ? "0600" : "1800") }))
    .filter((s) => Date.parse(s.snapshotAt) <= now.getTime());
}

export function dueDiscovery(now = new Date()): string | null {
  const day = istDate(now);
  const sunday = new Date(`${day}T00:00:00Z`).getUTCDay() === 0;
  const istHour = new Date(now.getTime() + 5.5 * 3600000).getUTCHours();
  return sunday && istHour >= 2 ? day : null;
}

export async function scheduleDiscovery(q: ReturnType<typeof sqlFn>, now = new Date()): Promise<string | null> {
  const day = dueDiscovery(now);
  return day ? enqueue(q, "discover", { day }, undefined, `discover:${day}`) : null;
}

export async function scheduleSnapshots(q: ReturnType<typeof sqlFn>, now = new Date()): Promise<string[]> {
  const ids: string[] = [];
  for (const slot of dueSnapshots(now)) {
    ids.push(await enqueue(q, "collect", { ...slot, scrape: true }, undefined, `collect:${slot.snapshotAt}`));
  }
  return ids;
}
