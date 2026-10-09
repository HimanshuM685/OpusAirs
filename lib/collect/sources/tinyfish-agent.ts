import type { CollectBudget } from "../budget";
import { tinyfishEnabled } from "../budget";
import { botUserAgent } from "../http";
import { parseQuoteRows } from "../parse";
import { robotsVerdict, type RobotsVerdict } from "../robots";
import { AGENT_API, pause, TinyfishApi, tinyfishError } from "../tinyfish";
import { safeLogMessage } from "../reporter";
import type { CollectCell, CollectResult, SourceAdapter } from "../types";

export const QUOTE_SCHEMA = {
  type: "array", items: { type: "object", additionalProperties: false,
    properties: { origin: { type: "string" }, destination: { type: "string" }, carrier: { type: "string" },
      flight_no: { type: "string" }, dep_date: { type: "string" }, total_fare: { type: ["number", "null"] },
      fare_class: { type: "string", enum: ["ECONOMY"] }, status: { type: "string", enum: ["ok", "sold_out"] } },
    required: ["origin", "destination", "carrier", "flight_no", "dep_date", "total_fare", "fare_class", "status"] },
};
type AgentDeps = { api?: TinyfishApi; gate?: (url: string) => Promise<RobotsVerdict>;
  sleep?: (ms: number, signal?: AbortSignal) => Promise<void>; now?: () => number };

export async function collectAgent(adapter: SourceAdapter, cells: CollectCell[], budget: CollectBudget,
  save: (cell: CollectCell, result: CollectResult) => Promise<void>, signal: AbortSignal, deps: AgentDeps = {}): Promise<void> {
  if (!cells.length || !adapter.searchUrl || !adapter.carrier || !tinyfishEnabled() || !budget.canRunAgent(adapter.id)) return;
  const gate = deps.gate || robotsVerdict;
  for (const url of [`https://${adapter.host}/`, ...cells.map(adapter.searchUrl)]) {
    const verdict = await gate(url);
    if (verdict.verdict !== "allow") {
      await budget.airline(adapter.id, { blocked_reason: verdict.notes, path: "skipped" });
      for (const cell of cells) await save(cell, { source: `agent:${adapter.id}`, sourceRank: 28, status: "blocked_robots", quotes: [], notes: verdict.notes });
      return;
    }
  }
  if (signal.aborted || !await budget.reserve(adapter.id, "agent")) return;
  const api = deps.api || new TinyfishApi(budget);
  const now = deps.now || Date.now;
  let id: string | undefined; let terminal = false;
  try {
    await budget.airline(adapter.id, { path: "agent", phase: "tinyfish_agent_create" });
    const goal = `On the airline public booking site, use the booking form: select origin, destination, ONE WAY, one adult, ECONOMY and each requested departure date, then submit search and wait for results. Do not assume URL query parameters prefill the form. Verify the displayed route, date, cabin and INR currency before reading the lowest TOTAL fare including taxes. Carrier: ${adapter.carrier}. Return the observed flight number and fare only; never estimate or invent a fare. Report sold_out only when the page explicitly says so. Return JSON matching the schema. Identify requests as ${botUserAgent()}. Only visit robots-allowed URLs on ${adapter.host}; obey robots.txt before any additional resource. If identification or robots compliance is impossible, stop. Stop on CAPTCHA, challenge, access block or login requirement; never circumvent. Do not log in, book, purchase, use other sites, accounts, saved profiles, or credentials. Work in this priority order; return completed observations if the time limit is reached: ${cells.map((c) => `${c.origin}-${c.destination} ${c.depDate}`).join("; ")}`;
    const res = await api.request(`${AGENT_API}/v1/automation/run-async`, "POST", {
      url: adapter.searchUrl(cells[0]), goal, output_schema: QUOTE_SCHEMA, browser_profile: "lite",
      // Agent accepts enabled/country_code, not Browser's proxy "type" field.
      proxy_config: { enabled: true, country_code: "IN" }, agent_config: { max_steps: 40, max_duration_seconds: 600 },
      use_profile: false, use_vault: false,
    }, signal);
    if (!res.ok) { await budget.airline(adapter.id, { error: await tinyfishError(res) }); return; }
    const created = await res.json() as { run_id?: string };
    id = created.run_id;
    if (!id) { await budget.disableTinyfish("agent_create_unconfirmed"); return; }
    await budget.airline(adapter.id, { agent_id: id, agent_terminal: false, path: "agent" });
    const expires = now() + 12 * 60000;
    while (now() < expires && !signal.aborted && !budget.state.tinyfish_disabled) {
      await budget.airline(adapter.id, { path: "agent", phase: "tinyfish_agent_poll" });
      const poll = await api.request(`${AGENT_API}/v1/runs/${encodeURIComponent(id)}`, "GET", undefined, signal);
      if (!poll.ok) { await budget.airline(adapter.id, { error: await tinyfishError(poll) }); break; }
      const run = await poll.json() as { status: string; result?: unknown; steps?: { action?: string | null }[]; error?: { code?: string; category?: string; message?: string } };
      const lastAction = run.steps?.at(-1)?.action;
      if (lastAction) await budget.airline(adapter.id, { phase: safeLogMessage(lastAction), last_status: run.status });
      if (["COMPLETED", "FAILED", "CANCELLED"].includes(run.status)) {
        terminal = true;
        await budget.airline(adapter.id, { agent_terminal: true });
        await budget.airline(adapter.id, { path: "agent", phase: `tinyfish_agent_${run.status.toLowerCase()}` });
        if (run.error?.category === "BILLING_FAILURE") await budget.disableTinyfish("tinyfish_agent_billing_failure");
        if (run.error?.code === "SITE_BLOCKED") await budget.airline(adapter.id, { blocked_reason: "agent_site_blocked" });
        if (run.status !== "COMPLETED") { await budget.airline(adapter.id, { error: safeLogMessage(`${run.error?.code || run.status}: ${run.error?.message || "Agent did not complete"}`) }); break; }
        let output = run.result;
        if (output && !Array.isArray(output) && typeof output === "object") output = (output as { result?: unknown }).result;
        if (typeof output === "string") { try { output = JSON.parse(output); } catch { output = null; } }
        const accepted = parseQuoteRows(output, cells, adapter.carrier);
        for (const cell of cells) {
          const quotes = accepted.filter((q) => q.origin === cell.origin && q.destination === cell.destination && q.dep_date === cell.depDate);
          if (!quotes.length) continue;
          const ok = quotes.filter((q) => q.status === "ok");
          await save(cell, { source: `agent:${adapter.id}`, sourceRank: 28, status: ok.length ? "ok" : "sold_out",
            quotes: ok.length ? ok : quotes, notes: "agent_provisional; parser_accepted",
          });
        }
        await budget.airline(adapter.id, { quotes_parsed: (budget.state.airlines[adapter.id]?.quotes_parsed || 0) + accepted.filter((q) => q.status === "ok").length });
        return; // Partial output never triggers a second Agent.
      }
      await (deps.sleep || pause)(10000, signal);
    }
  } catch (error) {
    await budget.airline(adapter.id, { error: signal.aborted ? "run_time_cap" : safeLogMessage(error) });
  } finally {
    if (id && !terminal) await api.cancelAgent(adapter.id, id);
  }
}
