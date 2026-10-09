export type CollectionMode = "tinyfish" | "http" | "offline";
export type CollectionSettings = {
  transport_mode: CollectionMode;
  max_sessions: number;
  max_agent_runs: number;
  max_hours: number;
};
export type JobProgress = {
  stage?: string; transport?: string; source?: string; current_cell?: string;
  completed?: number; total?: number; quotes?: number; status_counts?: Record<string, number>;
  last_message?: string; updated_at?: string;
};
export type JobEvent = {
  id: number; created_at: string; level: string; event: string;
  source?: string | null; transport?: string | null; message: string; data: Record<string, unknown>;
};
export type CollectionJob = {
  id: string; type: string; status: string; payload: { transportMode?: CollectionMode; snapshotAt?: string; day?: string };
  progress: JobProgress; error: string | null; cancel_requested: boolean;
  created_at: string; started_at: string | null; heartbeat_at: string | null; finished_at: string | null;
};
export type CollectionSchedule = {
  id: string; run_at: string; transport_mode: CollectionMode; recurrence: "once" | "daily";
  status: string; pipeline_job_id: string | null; include_demo: boolean;
};
export type WorkerPresence = {
  id: string; label: string; status: string; current_job_id: string | null; heartbeat_at: string;
  tinyfish_ready: boolean; tinyfish_reason: string; online: boolean;
};
export type CollectionMonitor = {
  server_time: string; settings: CollectionSettings; schedules: CollectionSchedule[];
  workers: WorkerPresence[]; job: CollectionJob | null; jobs: CollectionJob[]; events: JobEvent[];
  counts: Record<string, number>; total: number; completed: number; quotes: number;
  sources: { source: string; total: number; completed: number; counts: Record<string, number> }[];
  budget: { sessions_opened: number; sessions_deleted: number; session_attempts: number; agent_runs: number;
    tinyfish_disabled: boolean; notes: string | null; airlines: Record<string, {
      path?: string; phase?: string; current_cell?: string; quotes_parsed?: number; browser_visits?: number;
      session_id?: string; session_deleted?: boolean; agent_id?: string; agent_terminal?: boolean;
      error?: string; blocked_reason?: string;
    }> } | null;
  adapters: { id: string; enabled: boolean; kind: string; host: string | null; skipped_reason: string | null }[];
};

export const DEFAULT_SETTINGS: CollectionSettings = { transport_mode: "tinyfish", max_sessions: 5, max_agent_runs: 5, max_hours: 3 };
export const isCollectionMode = (value: unknown): value is CollectionMode => ["tinyfish", "http", "offline"].includes(String(value));
export const terminalJob = (status: string) => ["ok", "error", "cancelled"].includes(status);

export function istInputValue(date = new Date()): string {
  return new Date(date.getTime() + 330 * 60000).toISOString().slice(0, 16);
}
export function parseIstInput(value: string): string {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) throw new Error("Choose a valid date and time in IST.");
  const date = new Date(`${value}:00+05:30`);
  if (!Number.isFinite(date.getTime()) || istInputValue(date) !== value) throw new Error("Choose a valid date and time in IST.");
  return date.toISOString();
}
