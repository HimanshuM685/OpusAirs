import { istDate } from "./policy";
import { snapshotStamp } from "../snapshot";
import { enqueue } from "../jobs";
import type { sql as sqlFn } from "../db";

export function dueSnapshots(now = new Date(), hours = process.env.SNAPSHOT_HOURS || "6,18") {
  const day = istDate(now);
  return [...new Set(hours.split(",").map(Number))].filter((h) => h === 6 || h === 18)
    .map((h) => ({ day, slot: h === 6 ? "0600" : "1800", snapshotAt: snapshotStamp(day, h === 6 ? "0600" : "1800") }))
    .filter((s) => Date.parse(s.snapshotAt) <= now.getTime());
}

export async function scheduleSnapshots(q: ReturnType<typeof sqlFn>, now = new Date()): Promise<string[]> {
  const ids: string[] = [];
  for (const slot of dueSnapshots(now)) {
    ids.push(await enqueue(q, "collect", { ...slot, scrape: true }, undefined, `collect:${slot.snapshotAt}`));
  }
  return ids;
}
