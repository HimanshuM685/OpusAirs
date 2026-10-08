import type { CollectCell, CollectResult, SourceAdapter } from "./types";
import type { CollectBudget } from "./budget";
import { robotsVerdict, type RobotsVerdict } from "./robots";

export type AirlineTransport = (adapter: SourceAdapter, cells: CollectCell[], budget: CollectBudget,
  save: (cell: CollectCell, result: CollectResult) => Promise<void>, signal: AbortSignal) => Promise<void>;
export async function collectAirline(adapter: SourceAdapter, cells: CollectCell[], budget: CollectBudget,
  save: (cell: CollectCell, result: CollectResult) => Promise<void>, signal: AbortSignal,
  transports: { browser: AirlineTransport; agent: AirlineTransport; gate?: (url: string) => Promise<RobotsVerdict> }): Promise<void> {
  if (!cells.length) return;
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

  // Probe is one URL, never a per-cell Browser/Agent fallback.
  await budget.airline(adapter.id, { path: "http" });
  const probe = await adapter.collect(cells[0]);
  await checkpoint(cells[0], probe);
  if (probe.quotes.length) {
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
