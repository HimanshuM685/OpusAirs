import type { CollectCell, CollectResult, SourceAdapter } from "./types";
import type { CollectBudget } from "./budget";
import { robotsVerdict, type RobotsVerdict } from "./robots";
import { tinyfishEnabled } from "./budget";
import type { CollectionMode } from "./control";

export type AirlineTransport = (adapter: SourceAdapter, cells: CollectCell[], budget: CollectBudget,
  save: (cell: CollectCell, result: CollectResult) => Promise<void>, signal: AbortSignal) => Promise<void>;
export async function collectAirline(adapter: SourceAdapter, cells: CollectCell[], budget: CollectBudget,
  save: (cell: CollectCell, result: CollectResult) => Promise<void>, signal: AbortSignal,
  transports: { browser: AirlineTransport; agent: AirlineTransport; gate?: (url: string) => Promise<RobotsVerdict>; mode?: CollectionMode }): Promise<void> {
  if (!cells.length) return;
  const mode = transports.mode || "auto";
  if (mode === "offline" || signal.aborted) return;
  let closed = budget.state.airlines[adapter.id]?.blocked_reason;
  const missing = (notes: string, status: CollectResult["status"] = "missing"): CollectResult => ({ source: adapter.id, sourceRank: adapter.sourceRank, status, quotes: [], notes });
  const checkpoint = async (cell: CollectCell, result: CollectResult) => {
    if (["blocked", "blocked_robots"].includes(result.status)) {
      closed = result.notes || result.status;
      await budget.airline(adapter.id, { blocked_reason: closed });
    }
    await save(cell, result);
  };
  if (!closed && adapter.searchUrl && adapter.kind !== "skip" && !signal.aborted) {
    const gate = await (transports.gate || robotsVerdict)(adapter.searchUrl(cells[0]));
    if (gate.verdict !== "allow") closed = gate.notes;
  }
  if (closed || adapter.kind === "skip" || !adapter.enabled()) {
    const reason = closed || adapter.skippedReason || "adapter_disabled";
    await budget.airline(adapter.id, { path: "skipped", blocked_reason: reason });
    for (const cell of cells) await save(cell, missing(reason, adapter.kind === "skip" || closed?.startsWith("robots") ? "blocked_robots" : "blocked"));
    return;
  }
  if (signal.aborted) { for (const cell of cells) await save(cell, missing("run_time_cap")); return; }

  if (mode === "tinyfish") {
    if (!tinyfishEnabled()) {
      await budget.airline(adapter.id, { path: "skipped", phase: "tinyfish_unavailable", error: "tinyfish_unavailable" });
      for (const cell of cells) await save(cell, { source: adapter.id, sourceRank: adapter.sourceRank, status: "error", quotes: [], notes: "tinyfish_unavailable" });
      return;
    }
    const key = (cell: CollectCell) => `${cell.origin}|${cell.destination}|${cell.depDate}`;
    const resolved = new Set<string>();
    const pending = new Map<string, CollectResult>();
    const persist = async (cell: CollectCell, result: CollectResult) => {
      if (resolved.has(key(cell))) return;
      if (["missing", "error"].includes(result.status)) { pending.set(key(cell), result); return; }
      await checkpoint(cell, result); resolved.add(key(cell));
    };
    await budget.airline(adapter.id, { path: "browser", phase: "tinyfish_browser_start" });
    await transports.browser(adapter, cells, budget, persist, signal);
    if (!signal.aborted && !budget.state.airlines[adapter.id]?.blocked_reason && budget.canRunAgent(adapter.id)) {
      await budget.airline(adapter.id, { path: "agent", phase: "tinyfish_agent_start" });
      await transports.agent(adapter, cells.filter((cell) => !resolved.has(key(cell))), budget, persist, signal);
    }
    const failure = budget.state.airlines[adapter.id]?.error;
    for (const cell of cells) {
      if (signal.aborted) break;
      const result = pending.get(key(cell));
      if (result && !resolved.has(key(cell))) await checkpoint(cell, failure ? { ...result, status: "error", notes: failure } : result);
    }
    return;
  }
  // HTTP mode probes one URL, never a per-cell Browser/Agent fallback.
  await budget.airline(adapter.id, { path: "http" });
  const probe = await adapter.collect(cells[0]);
  await checkpoint(cells[0], probe);
  if (probe.quotes.length || mode === "http") {
    for (const cell of cells.slice(1)) {
      if (closed || signal.aborted) await save(cell, missing(closed || "run_time_cap", closed ? "blocked" : "missing"));
      else await checkpoint(cell, await adapter.collect(cell));
    }
    return; // Even a later partial HTTP miss does not spend Tinyfish calls.
  }
  if (!closed && probe.parserMiss && !signal.aborted) {
    if (budget.canOpenSession(adapter.id)) await transports.browser(adapter, cells, budget, checkpoint, signal);
    closed = budget.state.airlines[adapter.id]?.blocked_reason;
    if (!closed && budget.canRunAgent(adapter.id) && !signal.aborted) await transports.agent(adapter, cells, budget, checkpoint, signal);
  }
  // Caller closes unfinished cells after all single-airline paths complete.
}
