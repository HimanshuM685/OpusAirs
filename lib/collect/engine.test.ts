import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import type { sql as sqlFn } from "../db";
import { defineHtmlSource } from "./html-source";
import { PoliteHttp } from "./http";
import { resetRobotsCache } from "./robots";
import { collectors, enabledCollectors, selectAdapters } from "./sources";
import { syntheticDemo } from "./sources/synthetic_demo";
import { buildWorklist } from "./jobs";
import { istDate } from "./policy";
import { drainAdapters } from "./run";
import { dueSnapshots } from "./scheduler";
import type { CollectCell, CollectResult, SourceAdapter } from "./types";

const cell: CollectCell = { origin: "DEL", destination: "BOM", depDate: "2026-10-06", leadTimeDays: 1, fareClass: "ECONOMY", tripType: "one_way" };
const q = (async () => []) as unknown as ReturnType<typeof sqlFn>;
let scrape: string | undefined; let demo: string | undefined;
beforeEach(() => { scrape = process.env.SCRAPE_ENABLED; demo = process.env.SYNTHETIC_DEMO_ENABLED; resetRobotsCache(); });
afterEach(() => {
  if (scrape == null) delete process.env.SCRAPE_ENABLED; else process.env.SCRAPE_ENABLED = scrape;
  if (demo == null) delete process.env.SYNTHETIC_DEMO_ENABLED; else process.env.SYNTHETIC_DEMO_ENABLED = demo;
});

describe("ethical adapters", () => {
  it("robots denial returns blocked_robots with zero requests to the disallowed path", async () => {
    process.env.SCRAPE_ENABLED = "true";
    const calls: string[] = [];
    const http = new PoliteHttp({ enabled: () => true, fetch: async (url, opts) => {
      calls.push(String(url)); assert.match(String((opts?.headers as Record<string, string>)["User-Agent"]), /^OpusAirs-APIx-Bot\/1\.0/);
      return new Response("User-agent: *\nDisallow: /search");
    } });
    const adapter = defineHtmlSource({ id: "allowed", carrier: "AI", origin: "https://allowed.example", path: "/search" }, http);
    const result = await adapter.collect(cell);
    assert.equal(result.status, "blocked_robots"); assert.deepEqual(result.quotes, []);
    assert.deepEqual(calls, ["https://allowed.example/robots.txt"]);
  });

  it("robots fetch error fails closed and never requests fares", async () => {
    process.env.SCRAPE_ENABLED = "true";
    const calls: string[] = [];
    const http = new PoliteHttp({ enabled: () => true, fetch: async (url) => { calls.push(String(url)); return new Response("denied", { status: 403 }); } });
    const adapter = defineHtmlSource({ id: "allowed", carrier: "AI", origin: "https://allowed.example", path: "/search" }, http);
    assert.equal((await adapter.collect(cell)).status, "blocked_robots");
    assert.equal(calls.length, 1);
  });

  it("scrape off selects only offline adapters and cannot be overridden by a direct call", async () => {
    process.env.SCRAPE_ENABLED = "false"; process.env.SYNTHETIC_DEMO_ENABLED = "true";
    const http = new PoliteHttp({ fetch: async () => { assert.fail("HTTP while scraping disabled"); } });
    const all = collectors(q, "2026-10-05", http);
    assert.deepEqual(selectAdapters(all, new Set(all.map((a) => a.id)), false, true).map((a) => a.id), ["manual", "file_drop", "synthetic_demo"]);
    const html = all.find((a) => a.kind === "html")!;
    assert.equal((await html.collect(cell)).notes, "scrape_disabled");
    assert.deepEqual(await enabledCollectors(q, "2026-10-05"), []);
  });

  it("demo quotes are deterministic and explicitly tagged synthetic", async () => {
    const first = await syntheticDemo.collect(cell);
    assert.deepEqual(await syntheticDemo.collect(cell), first);
    assert.equal(first.source, "synthetic"); assert.equal(first.quotes[0].source, "synthetic");
    assert.match(first.notes || "", /not_an_observation/);
  });

  it("blocked source closes its host, but another host completes", async () => {
    let blockedCalls = 0; let healthyCalls = 0;
    const adapter = (id: string, collect: SourceAdapter["collect"]): SourceAdapter => ({ id, sourceRank: 20, kind: "html", host: `${id}.example`, enabled: () => true, allowedPath: async () => true, collect });
    const blocked = adapter("blocked", async () => { blockedCalls++; return { source: "blocked", sourceRank: 20, status: "blocked", quotes: [], notes: "challenge_page" }; });
    const healthy = adapter("healthy", async () => { healthyCalls++; return { source: "healthy", sourceRank: 20, status: "missing", quotes: [] }; });
    const remaining = new Map([[blocked.id, [cell, cell]], [healthy.id, [cell, cell]]]);
    const results: CollectResult[] = [];
    await drainAdapters([blocked, healthy], async (a) => remaining.get(a.id)!.shift() || null, (c) => c,
      async (_c, result) => { results.push(result); });
    assert.equal(blockedCalls, 1); assert.equal(healthyCalls, 2);
    assert.equal(results.filter((r) => r.status === "blocked").length, 2);
    assert.equal(results.length, 4);
  });
});

describe("basket and IST scheduling", () => {
  it("generates every route times six lead bins, economy one-way only", () => {
    const work = buildWorklist([{ origin: "DEL", destination: "BOM" }, { origin: "BOM", destination: "DEL" }], "2026-12-31");
    assert.equal(work.length, 12);
    for (const origin of ["DEL", "BOM"]) assert.deepEqual(work.filter((c) => c.origin === origin).map((c) => c.leadTimeDays), [1, 7, 15, 21, 30, 45]);
    assert.equal(work[0].depDate, "2027-01-01");
    assert.ok(work.every((c) => c.fareClass === "ECONOMY" && c.tripType === "one_way"));
  });

  it("uses IST date and schedules both distinct slots when due", () => {
    assert.equal(istDate(new Date("2026-10-04T20:00:00Z")), "2026-10-05");
    assert.deepEqual(dueSnapshots(new Date("2026-10-05T00:29:59Z")), []);
    assert.deepEqual(dueSnapshots(new Date("2026-10-05T00:30:00Z")).map((s) => s.slot), ["0600"]);
    const both = dueSnapshots(new Date("2026-10-05T12:30:00Z"));
    assert.deepEqual(both.map((s) => s.slot), ["0600", "1800"]);
    assert.notEqual(both[0].snapshotAt, both[1].snapshotAt);
  });
});
