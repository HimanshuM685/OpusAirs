import type { CollectBudget } from "../budget";
import { tinyfishEnabled } from "../budget";
import { botUserAgent } from "../http";
import { parseQuoteRows } from "../parse";
import { robotsVerdict, type RobotsVerdict } from "../robots";
import { AGENT_API, indiaProxy, pause, TinyfishApi } from "../tinyfish";
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
    const goal = `On the airline public booking site, for each listed city-pair and departure date, read the cheapest ECONOMY one-way total fare in INR. Carrier: ${adapter.carrier}. Do not log in. Skip sold-out. Return JSON matching the schema. Identify requests as ${botUserAgent()}. Only visit the listed robots-allowed URLs on ${adapter.host}; obey robots.txt before any additional resource. If identification or robots compliance is impossible, stop. Stop on CAPTCHA, challenge, access block or login requirement; never circumvent. Do not use other sites, accounts, saved profiles, or credentials. Pairs: ${cells.map((c) => `${c.origin}-${c.destination} ${c.depDate} (${adapter.searchUrl!(c)})`).join("; ")}`;
    const res = await api.request(`${AGENT_API}/v1/automation/run-async`, "POST", {
      url: adapter.searchUrl(cells[0]), goal, output_schema: QUOTE_SCHEMA, browser_profile: "lite",
      proxy_config: indiaProxy, agent_config: { max_steps: 40, max_duration_seconds: 600 },
      use_profile: false, use_vault: false,
    }, signal);
    if (!res.ok) { await budget.airline(adapter.id, { error: `tinyfish_http_${res.status}` }); return; }
    const created = await res.json() as { run_id?: string };
    id = created.run_id;
    if (!id) { await budget.disableTinyfish("agent_create_unconfirmed"); return; }
    await budget.airline(adapter.id, { agent_id: id, agent_terminal: false, path: "agent" });
    const expires = now() + 12 * 60000;
    while (now() < expires && !signal.aborted && !budget.state.tinyfish_disabled) {
      const poll = await api.request(`${AGENT_API}/v1/runs/${encodeURIComponent(id)}`, "GET", undefined, signal);
      if (!poll.ok) break;
      const run = await poll.json() as { status: string; result?: unknown; error?: { code?: string; category?: string } };
      if (["COMPLETED", "FAILED", "CANCELLED"].includes(run.status)) {
        terminal = true;
        await budget.airline(adapter.id, { agent_terminal: true });
        if (run.error?.category === "BILLING_FAILURE") await budget.disableTinyfish("tinyfish_agent_billing_failure");
        if (run.error?.code === "SITE_BLOCKED") await budget.airline(adapter.id, { blocked_reason: "agent_site_blocked" });
        if (run.status !== "COMPLETED") break;
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
        await budget.airline(adapter.id, { quotes_parsed: accepted.filter((q) => q.status === "ok").length });
        return; // Partial output never triggers a second Agent.
      }
      await (deps.sleep || pause)(10000, signal);
    }
  } catch {
    await budget.airline(adapter.id, { error: signal.aborted ? "run_time_cap" : "agent_failed" });
  } finally {
    if (id && !terminal) await api.cancelAgent(adapter.id, id);
  }
}
