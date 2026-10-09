import { botUserAgent } from "./http";
import { CollectBudget, tinyfishEnabled, type BudgetState } from "./budget";
import type { sql as sqlFn } from "../db";
import { safeLogMessage } from "./reporter";

export const BROWSER_API = "https://api.browser.tinyfish.ai";
export const AGENT_API = "https://agent.tinyfish.ai";
export const indiaProxy = { type: "tinyfish", country_code: "IN", enabled: true };
export async function tinyfishError(response: Response): Promise<string> {
  const body = await response.clone().json().catch(() => null) as { error?: { code?: string; message?: string }; request_id?: string } | null;
  return safeLogMessage(`Tinyfish HTTP ${response.status}${body?.error?.code ? ` ${body.error.code}` : ""}${body?.error?.message ? `: ${body.error.message}` : ""}${body?.request_id ? ` (request ${body.request_id})` : ""}`);
}
export const pause = (ms: number, signal?: AbortSignal) => new Promise<void>((resolve, reject) => {
  if (signal?.aborted) { reject(new Error("run_time_cap")); return; }
  const abort = () => { clearTimeout(timer); reject(new Error("run_time_cap")); };
  const timer = setTimeout(() => { signal?.removeEventListener("abort", abort); resolve(); }, ms);
  signal?.addEventListener("abort", abort, { once: true });
});
export async function abortable<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) throw new Error("run_time_cap");
  let abort!: () => void;
  const cancelled = new Promise<never>((_, reject) => { abort = () => reject(new Error("run_time_cap")); signal.addEventListener("abort", abort, { once: true }); });
  try { return await Promise.race([promise, cancelled]); }
  finally { signal.removeEventListener("abort", abort); }
}
export class TinyfishApi {
  constructor(readonly budget: CollectBudget, private fetcher: typeof fetch = fetch,
    private sleep: (ms: number) => Promise<void> = pause) {}

  async request(url: string, method: string, body?: unknown, signal?: AbortSignal, cleanup = false): Promise<Response> {
    if (!cleanup && (!tinyfishEnabled() || this.budget.state.tinyfish_disabled || signal?.aborted)) throw new Error("tinyfish_disabled");
    const res = await this.fetcher(url, { method, headers: { "X-API-Key": process.env.TINYFISH_API_KEY || "",
      "Content-Type": "application/json", "User-Agent": botUserAgent() }, body: body == null ? undefined : JSON.stringify(body),
      redirect: "manual", signal: cleanup ? AbortSignal.timeout(60000) : AbortSignal.any([AbortSignal.timeout(65000), ...(signal ? [signal] : [])]) });
    if ([401, 402, 429].includes(res.status)) {
      await this.budget.disableTinyfish(`tinyfish_http_${res.status}`);
      if (res.status === 429) {
        const header = res.headers.get("retry-after");
        const delay = header && /^\d+$/.test(header) ? Number(header) * 1000 : header ? Math.max(0, Date.parse(header) - Date.now()) : 3000;
        await abortable(this.sleep(Number.isFinite(delay) ? delay : 3000), signal || AbortSignal.timeout(65000));
      }
    }
    return res;
  }
  async deleteSession(airline: string, id: string): Promise<void> {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const res = await this.request(`${BROWSER_API}/${encodeURIComponent(id)}`, "DELETE", undefined, undefined, true);
        if (res.status === 204) { await this.budget.deleted(airline); return; }
        if (attempt === 0 && [409, 429, 503, 504].includes(res.status)) { await this.sleep(2000); continue; }
      } catch { if (attempt === 0) { await this.sleep(2000); continue; } }
      break;
    }
    await this.budget.airline(airline, { error: "session_delete_unconfirmed" });
    await this.budget.disableTinyfish("session_delete_unconfirmed");
  }
  async cancelAgent(airline: string, id: string): Promise<void> {
    try {
      const res = await this.request(`${AGENT_API}/v1/runs/${encodeURIComponent(id)}/cancel`, "POST", undefined, undefined, true);
      if (res.ok) {
        const result = await res.json() as { status?: string };
        if (["CANCELLED", "COMPLETED", "FAILED"].includes(result.status || "")) {
          await this.budget.airline(airline, { agent_terminal: true }); return;
        }
      }
    } catch { /* keep orphan ID persisted for recovery */ }
    await this.budget.disableTinyfish("agent_cancel_unconfirmed");
  }
  async recover(): Promise<void> {
    for (const [airline, a] of Object.entries(this.budget.state.airlines)) {
      if (a.session_id && !a.session_deleted) await this.deleteSession(airline, a.session_id);
      if (a.agent_id && !a.agent_terminal) await this.cancelAgent(airline, a.agent_id);
    }
  }
}

export async function recoverOrphanedBudgets(q: ReturnType<typeof sqlFn>): Promise<void> {
  if (!process.env.TINYFISH_API_KEY) return;
  const rows = (await q`SELECT b.* FROM collect_budget b LEFT JOIN pipeline_jobs j ON j.id = b.run_id
    WHERE (j.id IS NULL OR j.status IN ('ok', 'error', 'cancelled') OR COALESCE(j.heartbeat_at, j.started_at) < NOW() - INTERVAL '5 minutes')
    AND (b.sessions_opened > b.sessions_deleted OR EXISTS (
      SELECT 1 FROM jsonb_each(b.airlines) a WHERE a.value->>'agent_id' IS NOT NULL
        AND NOT COALESCE((a.value->>'agent_terminal')::boolean, false)))`) as BudgetState[];
  for (const row of rows) {
    const budget = new CollectBudget(q, row.run_id);
    budget.state = row;
    await new TinyfishApi(budget).recover();
  }
}
