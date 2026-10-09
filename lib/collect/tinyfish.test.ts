import assert from "node:assert/strict";
import { afterEach, beforeEach, it } from "node:test";
import type { Browser } from "playwright-core";
import { CollectBudget, type AirlineUsage } from "./budget";
import { TinyfishApi } from "./tinyfish";
import { collectBrowser } from "./sources/tinyfish-browser";
import { collectAgent } from "./sources/tinyfish-agent";
import { collectAirline } from "./airline";
import { defineHtmlSource } from "./html-source";
import { buildWorklist } from "./jobs";
import type { sql as sqlFn } from "../db";
import type { CollectCell, CollectResult } from "./types";
import { parseQuoteRows } from "./parse";
import { withCollectionSettings } from "./runtime";

class MemoryBudget extends CollectBudget {
  constructor() {
    super(null as unknown as ReturnType<typeof sqlFn>, "test");
    this.state = { run_id: "test", started_at: new Date().toISOString(), sessions_opened: 0, session_attempts: 0,
      sessions_deleted: 0, agent_runs: 0, tinyfish_disabled: false, notes: null, airlines: {} };
  }
  override async airline(id: string, patch: AirlineUsage) { this.state.airlines[id] = { ...this.state.airlines[id], ...patch }; }
  override async reserve(id: string, type: "browser" | "agent") {
    if (!(type === "browser" ? this.canOpenSession(id) : this.canRunAgent(id))) return false;
    if (type === "browser") { this.state.session_attempts++; await this.airline(id, { browser_attempted: true }); }
    else { this.state.agent_runs++; await this.airline(id, { agent_attempted: true }); }
    return true;
  }
  override async opened(id: string, session: string) { this.state.sessions_opened++; await this.airline(id, { session_id: session, session_deleted: false, path: "browser" }); }
  override async deleted(id: string) { if (!this.state.airlines[id].session_deleted) this.state.sessions_deleted++; await this.airline(id, { session_deleted: true }); }
  override async disableTinyfish(notes: string) { this.state.tinyfish_disabled = true; this.state.notes = notes; }
}
const cells = buildWorklist([{ origin: "DEL", destination: "BOM" }, { origin: "DEL", destination: "BLR" }], "2026-10-08");
const adapter = defineHtmlSource({ id: "airindia", carrier: "AI", origin: "https://allowed.example", path: "/search", sourceRank: 12 });
const allowed = async () => ({ verdict: "allow" as const, notes: "robots_allow", checked_at: null });
const signal = () => new AbortController().signal;
const html = '<div data-flight="AI101" data-cabin="ECONOMY" data-total="5000">';
let env: NodeJS.ProcessEnv;
beforeEach(() => {
  env = { ...process.env }; process.env.SCRAPE_ENABLED = "true"; process.env.TINYFISH_ENABLED = "true";
  process.env.TINYFISH_API_KEY = "test-only"; process.env.TINYFISH_COUNTRY = "IN";
});
afterEach(() => { process.env = env; });
function fakeBrowser(content: () => string = () => html) {
  const navigated: string[] = []; let connections = 0; let pages = 0; let closed = 0;
  const page = { setDefaultTimeout() {}, waitForLoadState: async () => {}, goto: async (url: string) => { navigated.push(url); return { status: () => 200 }; }, content: async () => content() };
  const context = { pages: () => { pages++; return [page]; }, setExtraHTTPHeaders: async (headers: Record<string, string>) => { assert.match(headers["User-Agent"], /^OpusAirs-APIx-Bot\/1.0/); },
    newCDPSession: async () => ({ send: async () => {} }), route: async () => {} };
  return { navigated, counts: () => ({ connections, pages, closed }), connect: async () => {
    connections++; return { contexts: () => [context], close: async () => { closed++; } } as unknown as Browser;
  } };
}
function browserApi(budget: MemoryBudget, codes: number[] = []) {
  const calls: { url: string; method: string; body?: Record<string, unknown> }[] = [];
  const api = new TinyfishApi(budget, async (url, init) => {
    const method = init?.method || "GET";
    calls.push({ url: String(url), method, body: init?.body ? JSON.parse(String(init.body)) : undefined });
    if (method === "POST") return new Response(JSON.stringify({ session_id: "br-test", cdp_url: "wss://test.example/cdp" }), { status: codes.shift() || 201 });
    return new Response(null, { status: codes.shift() || 204 });
  }, async () => {});
  return { api, calls };
}

it("denied robots produces no Browser create and no Agent run", async () => {
  const budget = new MemoryBudget(); const { api, calls } = browserApi(budget); const saved: CollectResult[] = [];
  const gate = async () => ({ verdict: "deny" as const, notes: "robots_disallow", checked_at: null });
  await collectBrowser(adapter, cells, budget, async (_c, r) => { saved.push(r); }, signal(), { api, gate });
  await budget.airline(adapter.id, { session_id: 'prior-parser-failure', session_deleted: true, browser_complete: true, browser_visits: cells.length, quotes_parsed: 0, blocked_reason: undefined });
  delete budget.state.airlines[adapter.id].blocked_reason;
  await collectAgent(adapter, cells, budget, async () => {}, signal(), { api, gate });
  assert.equal(calls.length, 0); assert.equal(budget.state.sessions_opened, 0); assert.equal(budget.state.agent_runs, 0);
  assert.ok(saved.every((r) => r.status === "blocked_robots"));
});
it("one JS airline uses one session and the same page across every ordered route/bin", async () => {
  const budget = new MemoryBudget(); const { api, calls } = browserApi(budget); const browser = fakeBrowser(); const saved: CollectResult[] = [];
  await collectBrowser(adapter, cells, budget, async (_c, r) => { saved.push(r); }, signal(), { api, gate: allowed, connect: browser.connect, sleep: async () => {} });
  assert.equal(calls.filter((c) => c.method === "POST").length, 1);
  assert.equal(calls.filter((c) => c.method === "DELETE").length, 1);
  assert.deepEqual(calls[0].body?.proxy_config, { type: "tinyfish", country_code: "IN", enabled: true });
  assert.deepEqual(browser.navigated, cells.map(adapter.searchUrl!));
  assert.deepEqual(browser.counts(), { connections: 1, pages: 1, closed: 1 });
  assert.equal(budget.state.sessions_opened, budget.state.sessions_deleted);
  assert.ok(saved.every((r) => r.source === "tinyfish:airindia" && r.sourceRank === 25));
  assert.equal(budget.canRunAgent(adapter.id), false);
  await collectBrowser(adapter, cells, budget, async () => {}, signal(), { api, gate: allowed });
  assert.equal(calls.filter((c) => c.method === "POST").length, 1);
});
it("session is deleted and retries once after 409, including a checkpoint throw", async () => {
  const budget = new MemoryBudget(); const { api, calls } = browserApi(budget, [201, 409, 204]); const browser = fakeBrowser();
  await assert.rejects(collectBrowser(adapter, cells, budget, async () => { throw new Error("checkpoint DB failed"); }, signal(), { api, gate: allowed, connect: browser.connect, sleep: async () => {} }));
  assert.equal(calls.filter((c) => c.method === "DELETE").length, 2);
  assert.equal(budget.state.sessions_opened, budget.state.sessions_deleted);
});
it("challenge stops visits, closes the host and prevents Agent escalation", async () => {
  const budget = new MemoryBudget(); const { api } = browserApi(budget); const browser = fakeBrowser(() => "Verify you are human");
  await collectBrowser(adapter, cells, budget, async () => {}, signal(), { api, gate: allowed, connect: browser.connect });
  assert.equal(browser.navigated.length, 1); assert.equal(budget.canRunAgent(adapter.id), false);
  assert.equal(budget.state.sessions_deleted, 1); assert.equal(budget.state.airlines[adapter.id].blocked_reason, "challenge_page");
});
it("402 or 429 disables Tinyfish for remaining airlines without another POST", async () => {
  for (const code of [402, 429]) {
    const budget = new MemoryBudget(); const { api, calls } = browserApi(budget, [code]);
    await collectBrowser(adapter, cells, budget, async () => {}, signal(), { api, gate: allowed });
    await collectBrowser({ ...adapter, id: "akasa" }, cells, budget, async () => {}, signal(), { api, gate: allowed });
    assert.equal(calls.length, 1); assert.equal(budget.state.tinyfish_disabled, true);
  }
});
it("HTML parser success uses no Browser or Agent, including later missing cells", async () => {
  const budget = new MemoryBudget(); let http = 0; let costly = 0; let checkpoints = 0;
  const httpAdapter = { ...adapter, collect: async (cell: CollectCell) => ++http === 1 ? adapter.parseHtml!(html, cell)
    : ({ source: adapter.id, sourceRank: 12, status: "missing" as const, quotes: [], parserMiss: true }) };
  await collectAirline(httpAdapter, cells, budget, async () => { checkpoints++; }, signal(),
    { browser: async () => { costly++; }, agent: async () => { costly++; }, gate: allowed });
  assert.equal(http, cells.length); assert.equal(checkpoints, cells.length); assert.equal(costly, 0);
});
it("async Agent runs once, validates rows and ignores partial/malformed/non-economy results", async () => {
  const budget = new MemoryBudget(); await budget.airline(adapter.id, { session_id: "br-test", session_deleted: true, browser_complete: true, browser_visits: cells.length, quotes_parsed: 0 });
  const calls: string[] = []; const saved: CollectResult[] = [];
  const row = { origin: cells[0].origin, destination: cells[0].destination, dep_date: cells[0].depDate, carrier: "AI", flight_no: "AI101", total_fare: 5000, fare_class: "ECONOMY", status: "ok" };
  const api = new TinyfishApi(budget, async (url, init) => {
    calls.push(String(url));
    if (init?.method === "POST") { const body = JSON.parse(String(init.body)); assert.equal(body.agent_config.max_steps, 40); assert.equal(body.proxy_config.country_code, "IN"); return Response.json({ run_id: "agent-test" }); }
    return Response.json({ status: "COMPLETED", result: { result: [row, { ...row, fare_class: "BUSINESS" }, { ...row, trip_type: "round_trip" }, { ...row, origin: "LHR" }] } });
  });
  await collectAgent(adapter, cells, budget, async (_c, r) => { saved.push(r); }, signal(), { api, gate: allowed });
  await collectAgent(adapter, cells, budget, async () => {}, signal(), { api, gate: allowed });
  assert.equal(budget.state.agent_runs, 1); assert.equal(saved.length, 1); assert.equal(saved[0].sourceRank, 28);
  assert.equal(saved[0].quotes.length, 1); assert.ok(saved[0].quotes[0].parser_accepted);
  assert.equal(calls.filter((c) => c.endsWith("run-async")).length, 1);
  assert.equal(parseQuoteRows([{ ...row, total_fare: -1 }], cells, "AI").length, 0);
});
it("Agent polling timeout cancels async run and cannot start another", async () => {
  const budget = new MemoryBudget(); await budget.airline(adapter.id, { session_id: "br-test", session_deleted: true, browser_complete: true, browser_visits: cells.length, quotes_parsed: 0 });
  let now = 0; const calls: string[] = [];
  const api = new TinyfishApi(budget, async (url) => { calls.push(String(url)); return Response.json(String(url).endsWith("run-async") ? { run_id: "agent-test" } : { status: String(url).endsWith('/cancel') ? 'CANCELLED' : "RUNNING" }); });
  await collectAgent(adapter, cells, budget, async () => {}, signal(), { api, gate: allowed, now: () => now, sleep: async () => { now += 12 * 60000; } });
  assert.ok(calls.some((u) => u.endsWith("/agent-test/cancel"))); assert.equal(budget.canRunAgent(adapter.id), false);
});
it("HTTP JS miss escalates to one Browser and one Agent only after all Browser parsers fail", async () => {
  const budget = new MemoryBudget(); const browser = fakeBrowser(() => '<script src="app.js"></script>');
  let sessions = 0; let agents = 0; let deletes = 0;
  const api = new TinyfishApi(budget, async (url, opts) => {
    const target = String(url);
    if (target === 'https://api.browser.tinyfish.ai') { sessions++; return Response.json({ session_id: 'br-test', cdp_url: 'wss://test.example/cdp' }, { status: 201 }); }
    if (opts?.method === 'DELETE') { deletes++; return new Response(null, { status: 204 }); }
    if (target.endsWith('run-async')) { agents++; return Response.json({ run_id: 'agent-test' }); }
    return Response.json({ status: 'COMPLETED', result: { result: [] } });
  });
  const js = { ...adapter, collect: async (c: CollectCell) => adapter.parseHtml!('<script src="app.js"></script>', c) };
  await collectAirline(js, cells, budget, async () => {}, signal(), {
    gate: allowed,
    browser: (...args) => collectBrowser(...args, { api, gate: allowed, connect: browser.connect, sleep: async () => {} }),
    agent: (...args) => collectAgent(...args, { api, gate: allowed }),
  });
  assert.equal(sessions, 1); assert.equal(deletes, 1); assert.equal(agents, 1);
  assert.equal(browser.navigated.length, cells.length);
});
it("robots fetch error never opens a session even when budget is available", async () => {
  const budget = new MemoryBudget(); const { api, calls } = browserApi(budget);
  await collectBrowser(adapter, cells, budget, async () => {}, signal(), { api,
    gate: async () => ({ verdict: 'fetch_error', notes: 'robots_fetch_error', checked_at: null }) });
  assert.equal(calls.length, 0); assert.equal(budget.state.session_attempts, 0);
});
it("non-India country or either disabled flag prevents every Tinyfish call", async () => {
  for (const [key, value] of [['TINYFISH_COUNTRY', 'US'], ['TINYFISH_ENABLED', 'false'], ['SCRAPE_ENABLED', 'false']]) {
    const previous = process.env[key]; process.env[key] = value;
    const budget = new MemoryBudget(); const { api, calls } = browserApi(budget);
    await collectBrowser(adapter, cells, budget, async () => {}, signal(), { api, gate: allowed });
    assert.equal(calls.length, 0);
    process.env[key] = previous;
  }
});

const tinyfishSettings = { transport_mode: "tinyfish" as const, max_sessions: 5, max_agent_runs: 5, max_hours: 3 };
it("Tinyfish-first skips HTTP, probes two hydrated shells, deletes Browser then starts one Agent", async () => {
  process.env.SCRAPE_ENABLED = "false"; process.env.TINYFISH_ENABLED = "false";
  await withCollectionSettings(tinyfishSettings, async () => {
    const budget = new MemoryBudget(); const browser = fakeBrowser(() => '<script src="app.js"></script>');
    const { api, calls } = browserApi(budget); let agentCells = 0;
    await collectAirline({ ...adapter, collect: async () => { throw new Error("HTTP must not run"); } }, cells, budget, async () => {}, signal(), {
      mode: "tinyfish", gate: allowed,
      browser: (...args) => collectBrowser(...args, { api, gate: allowed, connect: browser.connect, sleep: async () => {} }),
      agent: async (_adapter, remaining) => { assert.equal(budget.state.sessions_deleted, 1); assert.ok(budget.canRunAgent(adapter.id)); agentCells = remaining.length; },
    });
    assert.equal(browser.navigated.length, 2); assert.equal(agentCells, cells.length);
    assert.equal(calls.filter((c) => c.method === "POST").length, 1);
  });
});
it("Tinyfish partial Browser success sends only unresolved cells to Agent, preserving observed fares", async () => {
  await withCollectionSettings(tinyfishSettings, async () => {
    const budget = new MemoryBudget(); const saved: CollectCell[] = [];
    await collectAirline(adapter, cells, budget, async (cell) => { saved.push(cell); }, signal(), {
      mode: "tinyfish", gate: allowed,
      browser: async (_a, work, b, save) => {
        await b.airline(adapter.id, { session_id: "br-partial", session_deleted: true, browser_complete: true, browser_visits: cells.length, quotes_parsed: 1, parser_misses: cells.length - 1 });
        await save(work[0], adapter.parseHtml!(html, work[0]));
        for (const cell of work.slice(1)) await save(cell, { source: adapter.id, sourceRank: 25, status: "missing", quotes: [] });
      },
      agent: async (_a, remaining, _b, save) => {
        assert.deepEqual(remaining, cells.slice(1));
        await save(remaining[0], adapter.parseHtml!(html, remaining[0]));
      },
    });
    assert.equal(saved.length, cells.length); assert.equal(new Set(saved).size, cells.length);
  });
});
it("explicit HTTP never escalates and offline performs no robots or provider request", async () => {
  for (const mode of ["http", "offline"] as const) {
    let http = 0; let gates = 0;
    await collectAirline({ ...adapter, collect: async (c) => { http++; return adapter.parseHtml!("<script></script>", c); } }, cells, new MemoryBudget(), async () => {}, signal(), {
      mode, gate: async () => { gates++; return allowed(); },
      browser: async () => { assert.fail("Unexpected Browser"); }, agent: async () => { assert.fail("Unexpected Agent"); },
    });
    assert.equal(http, mode === "http" ? cells.length : 0); assert.equal(gates, mode === "http" ? 1 : 0);
  }
});
