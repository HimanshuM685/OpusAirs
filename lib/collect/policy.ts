export const HORIZON_DAYS = [1, 7, 14, 21, 30] as const;

export function addDays(iso: string, days: number): string {
  const d = new Date(`${iso.slice(0, 10)}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function leadDays(collectedOn: string, depDate: string): number {
  const a = new Date(`${collectedOn.slice(0, 10)}T00:00:00Z`).getTime();
  const b = new Date(`${depDate.slice(0, 10)}T00:00:00Z`).getTime();
  return Math.round((b - a) / 86400000);
}

export function isLockStale(lockedAt: string | Date | null, now = new Date(), minutes = 15): boolean {
  if (!lockedAt) return true;
  const t = lockedAt instanceof Date ? lockedAt.getTime() : new Date(lockedAt).getTime();
  if (Number.isNaN(t)) return true;
  return now.getTime() - t > minutes * 60 * 1000;
}

export function reclaimStatus(attempts: number): "pending" | "failed" {
  return attempts >= 3 ? "failed" : "pending";
}

export type JobSnap = {
  status: string;
  attempts: number;
  locked_at: string | null;
};

export function resumeJobs<T extends JobSnap>(jobs: T[], now = new Date()): T[] {
  return jobs.map((job) => {
    if (job.status !== "running" || !isLockStale(job.locked_at, now)) return job;
    return { ...job, status: reclaimStatus(job.attempts), locked_at: null };
  });
}

export function coverageExitCode(input: {
  threw: boolean;
  pendingAtStart: number;
  attempted: number;
}): number {
  if (input.threw) return 1;
  if (input.pendingAtStart > 0 && input.attempted === 0) return 1;
  return 0;
}

export function degradedSources(
  rows: { source: string; blocked: number; attempted: number }[],
): string[] {
  return rows
    .filter((r) => r.attempted > 0 && r.blocked / r.attempted > 0.5)
    .map((r) => r.source);
}

export type FarePick = {
  flight_no: string;
  base_fare: number | null;
  taxes: number | null;
  udf: number | null;
  convenience: number | null;
  total_fare: number;
  return_date?: string | null;
};

export function completeness(row: FarePick): number {
  let n = 0;
  if (row.flight_no && row.flight_no !== "NA") n += 2;
  if (row.base_fare != null) n += 1;
  if (row.taxes != null) n += 1;
  if (row.udf != null) n += 1;
  if (row.convenience != null) n += 1;
  if (row.return_date) n += 1;
  return n;
}

export function pickBest<T extends FarePick>(rows: T[]): T {
  return [...rows].sort((a, b) => {
    const score = completeness(b) - completeness(a);
    if (score) return score;
    return a.total_fare - b.total_fare;
  })[0];
}
