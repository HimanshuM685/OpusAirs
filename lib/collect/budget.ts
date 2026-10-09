import type { sql as sqlFn } from "../db";
import { collectionRuntime, liveCollectionEnabled } from "./runtime";
import type { CollectionReporter } from "./reporter";

export type AirlineUsage = {
  browser_attempted?: boolean; session_id?: string; session_deleted?: boolean;
  browser_visits?: number; quotes_parsed?: number; browser_complete?: boolean;
  parser_misses?: number;
  agent_attempted?: boolean; agent_id?: string; agent_terminal?: boolean;
  path?: "http" | "browser" | "agent" | "skipped";
  phase?: string; current_cell?: string; last_status?: string;
  blocked_reason?: string; error?: string;
};
export type BudgetState = {
  run_id: string; sessions_opened: number; sessions_deleted: number; session_attempts: number;
  agent_runs: number; tinyfish_disabled: boolean; notes: string | null;
  airlines: Record<string, AirlineUsage>; started_at: string;
};
export function tinyfishReadiness(): { ready: boolean; reason: string } {
  if (!process.env.TINYFISH_API_KEY) return { ready: false, reason: "Tinyfish API key is not configured on worker" };
  if ((process.env.TINYFISH_COUNTRY || "IN").toUpperCase() !== "IN") return { ready: false, reason: "Tinyfish country must be IN" };
  return { ready: true, reason: "API key configured; provider access checked when a run starts" };
}
export function tinyfishEnabled(): boolean {
  const runtime = collectionRuntime();
  return tinyfishReadiness().ready && (runtime ? runtime.transport_mode === "tinyfish"
    : liveCollectionEnabled() && process.env.TINYFISH_ENABLED === "true");
}
export function budgetCap(name: string): number {
  const raw = Number(process.env[name] ?? 5);
  return Number.isFinite(raw) ? Math.max(0, Math.min(5, Math.floor(raw))) : 5;
}

// Reservations survive worker crashes. A failed/ambiguous POST never earns another attempt.
export class CollectBudget {
  state!: BudgetState;
  constructor(private q: ReturnType<typeof sqlFn>, readonly runId: string, private caps?: { maxSessions?: number; maxAgentRuns?: number }, private reporter?: CollectionReporter) {}
  get sessionCap() { return this.caps?.maxSessions ?? budgetCap("TINYFISH_MAX_SESSIONS_PER_RUN"); }
  get agentCap() { return this.caps?.maxAgentRuns ?? budgetCap("TINYFISH_MAX_AGENT_RUNS_PER_RUN"); }

  async init(): Promise<this> {
    await this.q`INSERT INTO collect_budget (run_id) VALUES (${this.runId}) ON CONFLICT (run_id) DO NOTHING`;
    const rows = (await this.q`SELECT * FROM collect_budget WHERE run_id = ${this.runId}`) as BudgetState[];
    this.state = rows[0];
    return this;
  }
  canOpenSession(airline: string): boolean {
    return tinyfishEnabled() && !this.state.tinyfish_disabled && this.state.session_attempts < this.sessionCap
      && !this.state.airlines[airline]?.browser_attempted;
  }
  canRunAgent(airline: string): boolean {
    const a = this.state.airlines[airline];
    return tinyfishEnabled() && !this.state.tinyfish_disabled && this.state.agent_runs < this.agentCap
      && Boolean(a?.session_id && a.session_deleted && a.browser_complete && (a.browser_visits || 0) > 0)
      && (!a?.quotes_parsed || (collectionRuntime()?.transport_mode === "tinyfish" && Boolean(a?.parser_misses)))
      && !a?.blocked_reason && !a?.error && !a?.agent_attempted;
  }
  async reserve(airline: string, type: "browser" | "agent"): Promise<boolean> {
    if (!(type === "browser" ? this.canOpenSession(airline) : this.canRunAgent(airline))) return false;
    const key = type === "browser" ? "browser_attempted" : "agent_attempted";
    const cap = type === "browser" ? this.sessionCap : this.agentCap;
    const rows = (await this.q`
      UPDATE collect_budget SET
        session_attempts = session_attempts + ${type === "browser" ? 1 : 0},
        agent_runs = agent_runs + ${type === "agent" ? 1 : 0},
        airlines = jsonb_set(airlines, ARRAY[${airline}], COALESCE(airlines->${airline}, '{}'::jsonb) || ${JSON.stringify({ [key]: true })}::jsonb)
      WHERE run_id = ${this.runId} AND tinyfish_disabled = false
        AND (CASE WHEN ${type} = 'browser' THEN session_attempts ELSE agent_runs END) < ${cap}
        AND NOT COALESCE((airlines->${airline}->>${key})::boolean, false)
      RETURNING *
    `) as BudgetState[];
    if (!rows.length) return false;
    this.state = rows[0];
    return true;
  }
  async airline(airline: string, patch: AirlineUsage): Promise<void> {
    const before = this.state.airlines[airline] || {};
    const rows = (await this.q`UPDATE collect_budget SET airlines = jsonb_set(airlines, ARRAY[${airline}],
      COALESCE(airlines->${airline}, '{}'::jsonb) || ${JSON.stringify(patch)}::jsonb)
      WHERE run_id = ${this.runId} RETURNING *`) as BudgetState[];
    this.state = rows[0];
    const change = patch.error || patch.blocked_reason || (patch.phase !== before.phase ? patch.phase : undefined);
    if (change) await this.reporter?.event({ event: patch.error ? "transport_error" : patch.blocked_reason ? "source_blocked" : "transport_phase",
      level: patch.error ? "error" : patch.blocked_reason ? "warn" : "info", source: airline, transport: patch.path || before.path,
      message: `${airline}: ${change}` }, { source: airline, transport: patch.path || before.path, current_cell: patch.current_cell || "", stage: patch.phase || "collecting" });
    else if (patch.current_cell) { if (this.reporter) { this.reporter.progress = { ...this.reporter.progress, source: airline, current_cell: patch.current_cell }; await this.reporter.flush(); } }
  }
  async opened(airline: string, sessionId: string): Promise<void> {
    const rows = (await this.q`UPDATE collect_budget SET sessions_opened = sessions_opened + 1,
      airlines = jsonb_set(airlines, ARRAY[${airline}], COALESCE(airlines->${airline}, '{}'::jsonb)
        || ${JSON.stringify({ session_id: sessionId, path: "browser", session_deleted: false })}::jsonb)
      WHERE run_id = ${this.runId} AND airlines->${airline}->>'session_id' IS NULL RETURNING *`) as BudgetState[];
    if (rows.length) this.state = rows[0];
    await this.reporter?.event({ event: "browser_opened", source: airline, transport: "browser", message: `${airline}: Tinyfish Browser session opened`, data: { session_id: sessionId } });
  }
  async deleted(airline: string): Promise<void> {
    const rows = (await this.q`UPDATE collect_budget SET sessions_deleted = sessions_deleted + 1,
      airlines = jsonb_set(airlines, ARRAY[${airline}, 'session_deleted'], 'true'::jsonb)
      WHERE run_id = ${this.runId} AND COALESCE((airlines->${airline}->>'session_deleted')::boolean, false) = false
        AND airlines->${airline}->>'session_id' IS NOT NULL
      RETURNING *`) as BudgetState[];
    if (rows.length) this.state = rows[0];
    await this.reporter?.event({ event: "browser_deleted", source: airline, transport: "browser", message: `${airline}: Tinyfish Browser session closed` });
  }
  async disableTinyfish(notes: string): Promise<void> {
    const rows = (await this.q`UPDATE collect_budget SET tinyfish_disabled = true, notes = ${notes.slice(0, 1000)}
      WHERE run_id = ${this.runId} RETURNING *`) as BudgetState[];
    this.state = rows[0];
  }
}
