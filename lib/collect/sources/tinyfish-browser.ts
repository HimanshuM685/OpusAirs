import type { Browser, Route } from "playwright-core";
import type { CollectBudget } from "../budget";
import { tinyfishEnabled } from "../budget";
import { botUserAgent, CHALLENGE } from "../http";
import { robotsVerdict, type RobotsVerdict } from "../robots";
import { abortable, BROWSER_API, indiaProxy, pause, TinyfishApi } from "../tinyfish";
import type { CollectCell, CollectResult, SourceAdapter } from "../types";

export type BrowserDeps = {
  api?: TinyfishApi;
  connect?: (url: string) => Promise<Browser>;
  gate?: (url: string) => Promise<RobotsVerdict>;
  sleep?: (ms: number, signal?: AbortSignal) => Promise<void>;
  random?: () => number;
};

export async function collectBrowser(adapter: SourceAdapter, cells: CollectCell[], budget: CollectBudget,
  save: (cell: CollectCell, result: CollectResult) => Promise<void>, runSignal: AbortSignal, deps: BrowserDeps = {}): Promise<void> {
  if (!cells.length || !adapter.searchUrl || !adapter.parseHtml || !adapter.host || !tinyfishEnabled()) return;
  const gate = deps.gate || robotsVerdict;
  const api = deps.api || new TinyfishApi(budget);
  const sleep = deps.sleep || pause;
  const outcome = (status: CollectResult["status"], notes: string): CollectResult => ({ source: `tinyfish:${adapter.id}`, sourceRank: 25, status, notes, quotes: [] });
  // Every target, including the origin, is authorized before paying for a session.
  for (const url of [`https://${adapter.host}/`, ...cells.map(adapter.searchUrl)]) {
    const verdict = await gate(url);
    if (verdict.verdict !== "allow") {
      await budget.airline(adapter.id, { blocked_reason: verdict.notes, path: "skipped" });
      for (const cell of cells) await save(cell, outcome("blocked_robots", verdict.notes));
      return;
    }
  }
  if (runSignal.aborted || !await budget.reserve(adapter.id, "browser")) return;
  let id: string | undefined; let browser: Browser | undefined;
  let visits = 0; let parsed = 0; let parserFailures = 0; let complete = false; let blocked: string | undefined;
  const seconds = Math.max(5, Math.min(900, Number(process.env.TINYFISH_SESSION_TIMEOUT_S) || 900));
  const controller = new AbortController();
  const signal = AbortSignal.any([runSignal, controller.signal]);
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const openedAt = Date.now();
    // Start blank: Tinyfish startup navigation otherwise precedes CDP bot-UA/robots guards.
    const res = await api.request(BROWSER_API, "POST", { timeout_seconds: seconds, proxy_config: indiaProxy }, runSignal);
    if (!res.ok) { await budget.airline(adapter.id, { error: `tinyfish_http_${res.status}`, path: "skipped" }); return; }
    const created = await res.json() as { session_id?: string; cdp_url?: string };
    id = created.session_id;
    if (!id) { await budget.disableTinyfish("session_create_unconfirmed"); return; }
    await budget.opened(adapter.id, id);
    if (!created.cdp_url?.startsWith("wss://")) throw new Error("invalid_cdp_url");
    timer = setTimeout(() => controller.abort(), Math.max(0, seconds * 1000 - (Date.now() - openedAt)));
    browser = await abortable((deps.connect || (async (url) => {
      const { chromium } = await import("playwright-core");
      return chromium.connectOverCDP(url, { timeout: 60000 });
    }))(created.cdp_url), signal);
    const context = browser.contexts()[0]; const page = context?.pages()[0];
    if (!context || !page) throw new Error("session_missing_initial_page");
    page.setDefaultTimeout(30000);
    await context.setExtraHTTPHeaders({ "User-Agent": botUserAgent() });
    const cdp = await context.newCDPSession(page);
    await cdp.send("Network.setUserAgentOverride", { userAgent: botUserAgent() });
    const guard = async (route: Route) => {
      const url = new URL(route.request().url());
      if (signal.aborted || blocked || !tinyfishEnabled() || url.protocol !== "https:" || url.host !== adapter.host) { await route.abort(); return; }
      try {
        const verdict = await gate(url.href);
        if (verdict.verdict !== "allow") { blocked = verdict.notes; await route.abort(); return; }
        await route.continue();
      } catch { blocked = "robots_fetch_error"; await route.abort(); }
    };
    await context.route("**/*", guard);
    for (const cell of cells) {
      if (signal.aborted || blocked || budget.state.tinyfish_disabled) break;
      if (visits) await sleep(2000 + (deps.random || Math.random)() * 2000, signal);
      const url = adapter.searchUrl(cell);
      const verdict = await gate(url);
      if (verdict.verdict !== "allow") { blocked = verdict.notes; await save(cell, outcome("blocked_robots", blocked)); break; }
      let html: string; let status: number;
      try {
        const response = await abortable(page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 }), signal);
        status = response?.status() || 0;
        html = await abortable(page.content(), signal);
      } catch {
        if (blocked || signal.aborted) break;
        await save(cell, outcome("error", "browser_navigation_error"));
        continue;
      }
      visits++;
      if (CHALLENGE.test(html) || [401, 403, 429].includes(status)) {
        blocked = CHALLENGE.test(html) ? "challenge_page" : `http_${status}`;
        await save(cell, outcome("blocked", blocked)); break;
      }
      const result = status >= 400 || status === 0 ? outcome("error", `http_${status}`) : adapter.parseHtml(html, cell);
      parsed += result.quotes.length;
      if (result.parserMiss && result.status === "missing") parserFailures++;
      await budget.airline(adapter.id, { browser_visits: visits, quotes_parsed: parsed });
      await save(cell, { ...result, source: `tinyfish:${adapter.id}`, sourceRank: 25,
        quotes: result.quotes.map((q) => ({ ...q, source: `tinyfish:${adapter.id}`, source_rank: 25, parser_accepted: true })) });
    }
    complete = !signal.aborted && !blocked && !budget.state.tinyfish_disabled && visits === cells.length && parserFailures === visits;
  } catch (err) {
    await budget.airline(adapter.id, { error: signal.aborted ? "run_time_cap" : "browser_session_failed" });
    // Checkpoint failures must surface after cleanup, not silently lose earlier persistence errors.
    if (!signal.aborted && err instanceof Error && !/cdp|browser|session|page|Timeout/i.test(err.message)) throw err;
  } finally {
    if (timer) clearTimeout(timer);
    if (id) await api.deleteSession(adapter.id, id);
    if (browser) await Promise.race([browser.close().catch(() => {}), new Promise<void>((r) => { const t = setTimeout(r, 5000); t.unref(); })]);
    await budget.airline(adapter.id, { browser_visits: visits, quotes_parsed: parsed, browser_complete: complete,
      ...(blocked ? { blocked_reason: blocked } : {}) });
  }
}
