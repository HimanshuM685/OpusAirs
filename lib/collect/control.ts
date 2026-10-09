import { randomUUID } from "node:crypto";
import type { sql as sqlFn } from "../db";
import { istDate } from "./policy";
import { DEFAULT_SETTINGS, isCollectionMode, type CollectionMode, type CollectionSettings, type CollectionSchedule } from "./contracts";
export type { CollectionMode, CollectionSettings } from "./contracts";
export { isCollectionMode as validCollectionMode } from "./contracts";
type Q = ReturnType<typeof sqlFn>;

export class CollectionInputError extends Error {}
export type CollectionEvent = {
  level?: "info" | "warn" | "error"; event: string; source?: string; transport?: string;
  message: string; data?: Record<string, unknown>;
};

export function validateSettings(input: unknown): CollectionSettings {
  if (!input || typeof input !== "object") throw new CollectionInputError("Collection settings are required.");
  const value = input as CollectionSettings;
  if (!isCollectionMode(value.transport_mode)) throw new CollectionInputError("Choose Tinyfish, HTTP, or offline transport.");
  for (const key of ["max_sessions", "max_agent_runs"] as const) {
    if (!Number.isInteger(value[key]) || value[key] < 0 || value[key] > 5) throw new CollectionInputError(`${key} must be an integer from 0 to 5.`);
  }
  if (typeof value.max_hours !== "number" || !Number.isFinite(value.max_hours) || value.max_hours < 0.05 || value.max_hours > 3)
    throw new CollectionInputError("Maximum runtime must be between 0.05 and 3 hours.");
  if (value.transport_mode === "tinyfish" && value.max_sessions === 0) throw new CollectionInputError("Tinyfish mode needs at least one Browser session.");
  return { transport_mode: value.transport_mode, max_sessions: value.max_sessions, max_agent_runs: value.max_agent_runs, max_hours: value.max_hours };
}
export async function readCollectionSettings(q: Q): Promise<CollectionSettings> {
  const rows = await q`SELECT transport_mode, max_sessions, max_agent_runs, max_hours FROM collection_settings WHERE id = 1`;
  return validateSettings(rows[0] || DEFAULT_SETTINGS);
}
export async function updateCollectionSettings(q: Q, input: unknown) {
  const value = validateSettings(input);
  await q`UPDATE collection_settings SET transport_mode = ${value.transport_mode}, max_sessions = ${value.max_sessions},
    max_agent_runs = ${value.max_agent_runs}, max_hours = ${value.max_hours}, updated_at = NOW() WHERE id = 1`;
  return value;
}
export async function recordJobEvent(q: Q, jobId: string, entry: CollectionEvent): Promise<void> {
  await q`INSERT INTO pipeline_job_events (job_id, level, event, source, transport, message, data)
    VALUES (${jobId}, ${entry.level || "info"}, ${entry.event}, ${entry.source || null}, ${entry.transport || null},
      ${entry.message.slice(0, 1000)}, ${JSON.stringify(entry.data || {})}::jsonb)`;
}
export async function readJobEvents(q: Q, jobId: string, limit = 40) {
  return q`SELECT id, created_at, level, event, source, transport, message, data
    FROM pipeline_job_events WHERE job_id = ${jobId} ORDER BY id DESC LIMIT ${Math.max(1, Math.min(100, limit))}`;
}
export async function updateJobProgress(q: Q, jobId: string, progress: Record<string, unknown>) {
  await q`UPDATE pipeline_jobs SET progress = progress || ${JSON.stringify({ ...progress, updated_at: new Date().toISOString() })}::jsonb WHERE id = ${jobId}`;
}
export async function activeCollection(q: Q) {
  const rows = await q`SELECT id, status FROM pipeline_jobs WHERE type = 'collect' AND status IN ('queued', 'running')
    ORDER BY CASE WHEN status = 'running' THEN 0 ELSE 1 END, created_at LIMIT 1`;
  return rows[0] as { id: string; status: string } | undefined;
}

// A transaction-scoped row lock serializes web clicks and multiple schedulers.
// The second statement sees commits made by the previous lock owner.
export async function queueCollection(q: Q, payload: Record<string, unknown>, dedupeKey?: string) {
  const id = randomUUID();
  const result = await q.transaction([
    q`SELECT id FROM collection_settings WHERE id = 1 FOR UPDATE`,
    q`INSERT INTO pipeline_jobs (id, type, status, payload, dedupe_key)
      SELECT ${id}::uuid, 'collect', 'queued', ${JSON.stringify(payload)}::jsonb, ${dedupeKey || null}
      WHERE NOT EXISTS (SELECT 1 FROM pipeline_jobs WHERE type = 'collect' AND status IN ('queued', 'running'))
      ON CONFLICT (dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING RETURNING id`,
    q`SELECT id FROM pipeline_jobs WHERE (type = 'collect' AND status IN ('queued', 'running'))
      OR (${dedupeKey || null}::text IS NOT NULL AND dedupe_key = ${dedupeKey || null})
      ORDER BY CASE WHEN status = 'running' THEN 0 ELSE 1 END, created_at LIMIT 1`,
  ], { isolationLevel: "ReadCommitted" });
  const inserted = result[1]?.[0]?.id;
  const selected = inserted || result[2]?.[0]?.id;
  if (!selected) throw new Error("Could not queue collection; try again.");
  return { id: String(selected), existing: !inserted };
}

export async function createCollectionSchedule(q: Q, input: { runAt: string; mode: CollectionMode; recurrence?: string; requestedBy?: string }, now = new Date()) {
  const date = new Date(input.runAt);
  if (!Number.isFinite(date.getTime()) || date.getTime() < now.getTime() - 60000) throw new CollectionInputError("Choose a current or future start time in IST.");
  if (!isCollectionMode(input.mode)) throw new CollectionInputError("Choose a supported transport.");
  if (input.recurrence && !["once", "daily"].includes(input.recurrence)) throw new CollectionInputError("Choose once or daily recurrence.");
  const rows = await q`INSERT INTO collection_schedules (id, run_at, slot, transport_mode, recurrence, requested_by)
    VALUES (${randomUUID()}, ${date.toISOString()}, 'scheduled', ${input.mode}, ${input.recurrence || "once"}, ${input.requestedBy || null}) RETURNING *`;
  return rows[0];
}
export async function listCollectionSchedules(q: Q) {
  return q`SELECT id, run_at, transport_mode, recurrence, status, pipeline_job_id, include_demo
    FROM collection_schedules ORDER BY CASE WHEN status = 'scheduled' THEN 0 ELSE 1 END, run_at LIMIT 20`;
}
export async function scheduleDueCollections(q: Q, now = new Date()): Promise<string[]> {
  const settings = await readCollectionSettings(q);
  const rows = (await q`SELECT * FROM collection_schedules WHERE status = 'scheduled' AND run_at <= ${now.toISOString()}
    ORDER BY run_at LIMIT 1`) as CollectionSchedule[];
  const schedule = rows[0];
  if (!schedule) return [];
  // Missed dates cannot be collected retrospectively. Daily schedules move to the
  // next future slot; one-time schedules visibly expire rather than fabricate history.
  const missedDay = istDate(new Date(schedule.run_at)) !== istDate(now);
  let next = new Date(schedule.run_at);
  do { next = new Date(next.getTime() + 86400000); } while (next <= now);
  const id = randomUUID();
  const payload = { transportMode: schedule.transport_mode, settings: { ...settings, transport_mode: schedule.transport_mode },
    snapshotAt: new Date(schedule.run_at).toISOString(), day: istDate(new Date(schedule.run_at)), slot: "scheduled", scheduleId: schedule.id };
  const result = await q.transaction([
    q`SELECT id FROM collection_settings WHERE id = 1 FOR UPDATE`,
    q`INSERT INTO pipeline_jobs (id, type, status, payload, dedupe_key)
      SELECT ${id}::uuid, 'collect', 'queued', ${JSON.stringify(payload)}::jsonb, ${`schedule:${schedule.id}:${new Date(schedule.run_at).toISOString()}`}
      WHERE ${!missedDay} AND EXISTS (SELECT 1 FROM collection_schedules WHERE id = ${schedule.id} AND status = 'scheduled' AND run_at = ${schedule.run_at})
        AND NOT EXISTS (SELECT 1 FROM pipeline_jobs WHERE type = 'collect' AND status IN ('queued', 'running'))
      ON CONFLICT (dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING RETURNING id`,
    q`UPDATE collection_schedules SET status = ${schedule.recurrence === "daily" ? "scheduled" : missedDay ? "expired" : "queued"},
      run_at = ${schedule.recurrence === "daily" ? next.toISOString() : schedule.run_at},
      pipeline_job_id = CASE WHEN ${missedDay} THEN pipeline_job_id ELSE ${id}::uuid END, updated_at = NOW()
      WHERE id = ${schedule.id} AND status = 'scheduled' AND run_at = ${schedule.run_at}
        AND (${missedDay} OR EXISTS (SELECT 1 FROM pipeline_jobs WHERE id = ${id}))`,
  ], { isolationLevel: "ReadCommitted" });
  return result[1]?.length ? [id] : [];
}
export async function cancelSchedule(q: Q, id: string) {
  const result = await q.transaction([
    q`SELECT id FROM collection_settings WHERE id = 1 FOR UPDATE`,
    q`UPDATE collection_schedules SET status = 'cancelled', updated_at = NOW() WHERE id = ${id} AND status = 'scheduled' RETURNING id`,
  ]);
  return result[1];
}
export async function cancelCollection(q: Q, jobId: string) {
  const rows = await q`UPDATE pipeline_jobs SET cancel_requested = true,
    status = CASE WHEN status = 'queued' THEN 'cancelled' ELSE status END,
    finished_at = CASE WHEN status = 'queued' THEN NOW() ELSE finished_at END
    WHERE id = ${jobId} AND type = 'collect' AND status IN ('queued', 'running') RETURNING id`;
  if (rows.length) await recordJobEvent(q, jobId, { level: "warn", event: "cancel_requested", message: "Operator requested cancellation; worker will clean up active sessions." });
  await q`UPDATE collection_schedules SET status = 'cancelled', updated_at = NOW() WHERE pipeline_job_id = ${jobId}
    AND recurrence = 'once' AND EXISTS (SELECT 1 FROM pipeline_jobs WHERE id = ${jobId} AND status = 'cancelled')`;
  return Boolean(rows.length);
}
