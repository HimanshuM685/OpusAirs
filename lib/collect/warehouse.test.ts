import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { it } from "node:test";
import { bootstrap, loadBasket } from "../bootstrap";
import { constructIndex } from "../apix";
import { cleanQuotes } from "../cleaning";
import type { sql as sqlFn } from "../db";
import { toEvent, upsertEvents } from "../ingest";
import { enqueue } from "../jobs";
import { snapshotCoverage } from "../snapshot";
import { buildWorklist, claimNext, expandJobs } from "./jobs";
import { syntheticDemo } from "./sources/synthetic_demo";
import { runPipeline } from "./run";
import { runCollectJobs } from "./worker";
import { CollectBudget } from "./budget";
import { randomUUID } from "node:crypto";
import { parseSchedule } from "./catalog";
import { upsertCatalog } from "./discover";
import { pathToFileURL } from "node:url";
import { istDate } from "./policy";

// Opt-in integration test. Only a disposable, explicitly named PostgreSQL container is used.
it("PostgreSQL: idempotent schema, durable slot jobs, raw statuses, snapshots, and demo isolation", {
  skip: !process.env.COLLECT_TEST_POSTGRES_CONTAINER && !process.env.COLLECT_TEST_PGLITE_MODULE,
  timeout: 120000,
}, async () => {
  const container = process.env.COLLECT_TEST_POSTGRES_CONTAINER;
  if (container) assert.match(container, /^opusairs-collection-test(?:-[a-z0-9]+)?$/);
  // PGlite runs actual PostgreSQL in WASM, in memory, when Docker is unavailable.
  const pgliteModule = process.env.COLLECT_TEST_PGLITE_MODULE;
  const memory = pgliteModule ? new (await import(pathToFileURL(pgliteModule).href)).PGlite() as {
    exec(text: string): Promise<{ rows: Record<string, unknown>[] }[]>; close(): Promise<void>;
  } : null;
  const child = container ? spawn("docker", ["exec", "-i", container, "psql", "-U", "postgres", "-qAt", "-v", "ON_ERROR_STOP=1"]) : null;
  const reader = child ? createInterface({ input: child.stdout }) : null;
  let sequence = 0;
  let sqlTail: Promise<unknown> = Promise.resolve();
  let error = "";
  let pending: { marker: string; lines: string[]; resolve: (lines: string[]) => void; reject: (err: Error) => void } | null = null;
  child?.stderr.on("data", (chunk) => { error += String(chunk); });
  child?.on("error", (err) => pending?.reject(err));
  child?.on("exit", (code) => { if (code) pending?.reject(new Error(error)); });
  reader?.on("line", (line) => {
    if (!pending) return;
    if (line === pending.marker) { const task = pending; pending = null; task.resolve(task.lines); }
    else pending.lines.push(line);
  });
  function execute(text: string): Promise<string[]> {
    if (memory) {
      const result = sqlTail.then(async () => (await memory.exec(text)).flatMap((r) => r.rows.flatMap((row) => Object.values(row).map((value) => JSON.stringify(value)))));
      sqlTail = result.catch(() => undefined);
      return result;
    }
    const result = sqlTail.then(() => new Promise<string[]>((resolve, reject) => {
      const marker = `__opusairs_end_${++sequence}`;
      pending = { marker, lines: [], resolve, reject };
      child!.stdin.write(`${text.replace(/;\s*$/, "")};\n\\echo ${marker}\n`);
    }));
    sqlTail = result.catch(() => undefined);
    return result;
  }
  const literal = (value: unknown): string => value == null ? "NULL" : typeof value === "number" || typeof value === "boolean" ? String(value) : `'${String(value).replace(/'/g, "''")}'`;
  const query = async (text: string) => {
    if (/^\s*SELECT/i.test(text) || /\bRETURNING\b/i.test(text)) {
      const lines = await execute(`WITH result AS (${text}) SELECT COALESCE(json_agg(result), '[]') FROM result`);
      return JSON.parse(lines.join("\n"));
    }
    await execute(text);
    return [];
  };
  const tagged = (strings: TemplateStringsArray, ...values: unknown[]) => {
    const text = strings.map((part, i) => part + (i < values.length ? literal(values[i]) : "")).join("");
    return { text,
      then: (resolve: (rows: Record<string, unknown>[]) => unknown, reject: (err: Error) => unknown) => query(text).then(resolve, reject),
      catch: (reject: (err: Error) => unknown) => query(text).catch(reject),
    };
  };
  const q = Object.assign(tagged, {
    transaction: async (queries: { text: string }[]) => { await execute(`BEGIN; ${queries.map((q) => q.text).join(";")}; COMMIT`); return []; },
  }) as unknown as ReturnType<typeof sqlFn>;

  try {
    const schema = readFileSync(`${process.cwd()}/data/schema.sql`, "utf8");
    await execute(schema);
    await execute(schema); // Exercises the legacy unique-key upgrade and repeated runtime migrations.
    await q`TRUNCATE pipeline_jobs, collect_jobs, collect_attempts, quote_snapshots, quotes_clean,
      quotes_raw, collection_runs, collect_lock, basket_routes, scrape_sources, dgca_benchmark,
      collect_budget, route_catalog RESTART IDENTITY CASCADE`;
    await bootstrap(q); // Actual runtime DDL and seeds, as one advisory-locked transaction.
    const day = "2026-10-05";
    const morning = `${day}T00:30:00.000Z`;
    const evening = `${day}T12:30:00.000Z`;
    const basket = await loadBasket(q);
    const cells = buildWorklist(basket, day);
    for (const [slot, snapshotAt] of [["0600", morning], ["1800", evening]]) {
      assert.equal(await expandJobs(q, { collectedOn: day, snapshotAt, slot, sources: ["manual", "file_drop"] }), cells.length);
    }
    await expandJobs(q, { collectedOn: day, snapshotAt: morning, slot: "0600", sources: ["manual", "file_drop"] });
    const counts = await q`SELECT COUNT(*)::int AS n FROM collect_jobs`;
    assert.equal(counts[0].n, cells.length * 4);
    assert.equal((await claimNext(q, morning, "manual"))?.snapshot_slot, "0600");
    assert.equal((await claimNext(q, evening, "manual"))?.snapshot_slot, "1800");

    const first = await enqueue(q, "collect", { slot: "0600", snapshotAt: morning }, `collect:${morning}`);
    assert.equal(await enqueue(q, "collect", {}, `collect:${morning}`), first);
    await new Promise(setImmediate);
    const queued = await q`SELECT status FROM pipeline_jobs WHERE id = ${first}`;
    assert.equal(queued[0].status, "queued");

    await upsertEvents(q, cells.map((c) => toEvent({ source: "manual", origin: c.origin, destination: c.destination,
      carrier: "6E", flight_no: "6E101", dep_date: c.depDate, lead_time_days: c.leadTimeDays,
      collected_on: day, collected_at: `${day}T00:40:00Z`, total_fare: 5000, status: "ok" })), null);
    await upsertEvents(q, [toEvent({ source: "denied_fixture", origin: "DEL", destination: "BOM", carrier: "NA",
      dep_date: cells[0].depDate, collected_on: day, total_fare: null, status: "blocked_robots", notes: "robots_disallow" })], null);
    const denied = await q`SELECT status, notes, total_fare FROM quotes_raw WHERE source = 'denied_fixture'`;
    assert.equal(denied[0].status, "blocked_robots"); assert.equal(denied[0].notes, "robots_disallow"); assert.equal(denied[0].total_fare, null);
    await cleanQuotes(q);
    assert.ok(await constructIndex(q, { day, slot: "0600", snapshotAt: morning }) > 0);
    assert.ok(Math.abs((await snapshotCoverage(q, morning)).coverage - 1) < 1e-9);
    const economyIndex = await q`SELECT value FROM index_values WHERE series = 'apix_laspeyres' AND frequency = 'daily'`;
    await upsertEvents(q, cells.flatMap((c) => ['BUSINESS', 'ECONOMY'].map((fare_class) => toEvent({ source: 'fixture_other_cabins',
      origin: c.origin, destination: c.destination, carrier: 'AI', flight_no: 'AI101', dep_date: c.depDate,
      lead_time_days: c.leadTimeDays, collected_on: day, collected_at: `${day}T00:40:00Z`, total_fare: 60000,
      fare_class, trip_type: fare_class === 'BUSINESS' ? 'one_way' : 'round_trip' }))), null);
    await upsertEvents(q, cells.map((c) => toEvent({ source: 'agent:indigo', origin: c.origin, destination: c.destination,
      carrier: '6E', flight_no: '6E101', dep_date: c.depDate, lead_time_days: c.leadTimeDays, collected_on: day,
      collected_at: `${day}T00:40:00Z`, total_fare: 1000, parser_accepted: false })), null);
    await cleanQuotes(q);
    await constructIndex(q, { day, slot: '0600', snapshotAt: morning });
    assert.deepEqual(await q`SELECT value FROM index_values WHERE series = 'apix_laspeyres' AND frequency = 'daily'`, economyIndex);
    await constructIndex(q, { day, slot: "1800", snapshotAt: evening });
    const low = await snapshotCoverage(q, evening);
    assert.equal(low.coverage, 0); assert.equal(low.vintage, "provisional"); assert.equal(low.cells, cells.length);

    for (const cell of cells) {
      const result = await syntheticDemo.collect(cell);
      await upsertEvents(q, result.quotes.map((quote) => toEvent({ ...quote, collected_on: day, snapshot_at: evening })), null);
    }
    await cleanQuotes(q);
    await constructIndex(q, { day, slot: "1800", snapshotAt: evening, includeSynthetic: true });
    assert.equal((await snapshotCoverage(q, evening)).vintage, "demo");
    const demoRows = await q`SELECT DISTINCT vintage FROM index_values`;
    assert.ok(demoRows.some((r) => r.vintage === "demo"));
    await constructIndex(q, { day, slot: "1800", snapshotAt: evening });
    const official = await q`SELECT COUNT(*)::int AS n FROM index_values WHERE vintage = 'demo'`;
    assert.equal(official[0].n, 0);

    // Catalog-only prices produce route relatives and do not alter national weights or value.
    const nationalBefore = await q`SELECT value FROM index_values WHERE series = 'apix_laspeyres' AND frequency = 'daily'`;
    await upsertCatalog(q, parseSchedule('origin,destination,carrier,flight_no,dow_mask\nCCU,MAA,AI,AI101,127'), day);
    await upsertEvents(q, [toEvent({ source: 'manual', origin: 'CCU', destination: 'MAA', carrier: 'AI', flight_no: 'AI101',
      dep_date: '2026-10-26', lead_time_days: 21, collected_on: day, total_fare: 45000 })], null);
    await cleanQuotes(q);
    await constructIndex(q, { day, slot: 'adhoc', snapshotAt: `${day}T13:00:00Z` });
    const nationalAfter = await q`SELECT value FROM index_values WHERE series = 'apix_laspeyres' AND frequency = 'daily'`;
    assert.deepEqual(nationalAfter, nationalBefore);
    const catalogIndex = await q`SELECT value FROM index_values WHERE series = 'apix_route' AND origin = 'CCU' AND destination = 'MAA'`;
    assert.ok(catalogIndex.length > 0);
    // Remove fixture catalog row before existing full-basket assertions.
    await q`DELETE FROM route_catalog WHERE origin = 'CCU' AND destination = 'MAA'`;

    const oldTinyfish = process.env.TINYFISH_ENABLED;
    const oldKey = process.env.TINYFISH_API_KEY;
    const originalScrape = process.env.SCRAPE_ENABLED;
    process.env.SCRAPE_ENABLED = 'true'; process.env.TINYFISH_ENABLED = 'true'; process.env.TINYFISH_API_KEY = 'test-only';
    try {
      const runId = randomUUID(); const budget = await new CollectBudget(q, runId).init();
      assert.equal(await budget.reserve('airindia', 'browser'), true);
      assert.equal(await (await new CollectBudget(q, runId).init()).reserve('airindia', 'browser'), false);
      await budget.opened('airindia', 'br-fixture'); await budget.deleted('airindia'); await budget.deleted('airindia');
      assert.equal(budget.state.sessions_opened, 1); assert.equal(budget.state.sessions_deleted, 1);
      await budget.airline('airindia', { browser_complete: true, browser_visits: 6, quotes_parsed: 0 });
      assert.equal(await budget.reserve('airindia', 'agent'), true);
      assert.equal(await budget.reserve('airindia', 'agent'), false);
      for (const airline of ['indigo', 'akasa', 'spicejet', 'airindia_express']) assert.equal(await budget.reserve(airline, 'browser'), true);
      assert.equal(await budget.reserve('sixth', 'browser'), false);
      await budget.disableTinyfish('tinyfish_http_402');
      const persisted = await new CollectBudget(q, runId).init();
      assert.equal(persisted.state.tinyfish_disabled, true); assert.equal(persisted.state.agent_runs, 1);
    } finally {
      if (oldTinyfish == null) delete process.env.TINYFISH_ENABLED; else process.env.TINYFISH_ENABLED = oldTinyfish;
      if (oldKey == null) delete process.env.TINYFISH_API_KEY; else process.env.TINYFISH_API_KEY = oldKey;
      if (originalScrape == null) delete process.env.SCRAPE_ENABLED; else process.env.SCRAPE_ENABLED = originalScrape;
    }

    await q`TRUNCATE quote_snapshots, quotes_clean, quotes_raw CASCADE`;
    // A previously queued live source becomes disabled before recovery.
    await expandJobs(q, { collectedOn: day, snapshotAt: morning, slot: "0600", sources: ["airindia"] });
    const oldScrape = process.env.SCRAPE_ENABLED;
    const oldDemo = process.env.SYNTHETIC_DEMO_ENABLED;
    process.env.SCRAPE_ENABLED = "false";
    process.env.SYNTHETIC_DEMO_ENABLED = "true";
    try {
      const result = await runPipeline({ day, slot: "0600", snapshotAt: morning, demo: true }, q);
      assert.equal(result.coverage.vintage, "demo");
      assert.equal(result.coverage.coverage, 0);
      assert.equal(result.coverage.jobs.pending || 0, 0);
      assert.ok(result.coverage.blocked_sources.includes("airindia"));
      const rawDemo = await q`SELECT COUNT(*)::int AS n FROM quotes_raw WHERE source = 'synthetic' AND status = 'ok'`;
      assert.equal(rawDemo[0].n, cells.length);
      const attempts = await q`SELECT COUNT(*)::int AS n FROM collect_attempts`;
      assert.ok(Number(attempts[0].n) > 0);
      assert.ok(await runCollectJobs(q) > 0);
      const completedJob = await q`SELECT status, stats FROM pipeline_jobs WHERE id = ${first}`;
      assert.equal(completedJob[0].status, "ok");
      assert.equal((completedJob[0].stats as { coverage: { vintage: string } }).coverage.vintage, "provisional");
      // Operator jobs persist the complete input and survive response completion or
      // a worker restart; neither parsing nor ingestion runs in the HTTP process.
      const csv = `origin,destination,carrier,flight_no,dep_date,total_fare,collected_on\nDEL,BOM,6E,6E900,${day},5200,${day}`;
      const ingestJob = await enqueue(q, "ingest", { mode: "csv", text: csv, rebuild_index: false });
      const waiting = await q`SELECT status, payload FROM pipeline_jobs WHERE id = ${ingestJob}`;
      assert.equal(waiting[0].status, "queued");
      assert.equal((waiting[0].payload as { text: string }).text, csv);
      await q`UPDATE pipeline_jobs SET status = 'running', started_at = NOW() - INTERVAL '10 minutes', heartbeat_at = NOW() - INTERVAL '10 minutes' WHERE id = ${ingestJob}`;
      await runCollectJobs(q);
      const ingested = await q`SELECT status, stats FROM pipeline_jobs WHERE id = ${ingestJob}`;
      assert.equal(ingested[0].status, "ok");
      assert.equal((ingested[0].stats as { received: number }).received, 1);
      const failedJob = await enqueue(q, "ingest", { mode: "quotes", quotes: [], rebuild_index: false });
      const rebuildJob = await enqueue(q, "rebuild", { vintage: "provisional" });
      await runCollectJobs(q);
      assert.equal((await q`SELECT status FROM pipeline_jobs WHERE id = ${failedJob}`)[0].status, "error");
      assert.equal((await q`SELECT status FROM pipeline_jobs WHERE id = ${rebuildJob}`)[0].status, "ok");
      const oldEnv = { ...process.env }; const originalFetch = globalThis.fetch;
      try {
        process.env.SCRAPE_ENABLED = 'true'; process.env.TINYFISH_ENABLED = 'true'; process.env.TINYFISH_API_KEY = 'test-only';
        process.env.TINYFISH_COUNTRY = 'IN';
        await q`UPDATE scrape_sources SET enabled = true WHERE id IN ('airindia', 'akasa')`;
        let costlyPosts = 0;
        globalThis.fetch = async (url, options) => {
          const target = String(url);
          if (target === 'https://api.browser.tinyfish.ai' && options?.method === 'POST') {
            costlyPosts++; return Response.json({ error: 'INSUFFICIENT_CREDITS' }, { status: 402 });
          }
          if (target.endsWith('/robots.txt')) return new Response('User-agent: *\nAllow: /');
          if (target.startsWith('https://www.airindia.com/') || target.startsWith('https://www.akasaair.com/')) return new Response('<html><script src="app.js"></script></html>');
          throw new Error(`Unexpected external request in integration test: ${target}`);
        };
        // Test stays fast while still using the real policy/HTTP adapter and SQL pipeline.
        const current = istDate();
        const result = await runPipeline({ day: current, snapshotAt: `${current}T00:30:00Z`, slot: '0600', demo: true, runId: randomUUID() }, q);
        assert.equal(costlyPosts, 1); assert.equal(result.budget.tinyfish_disabled, true);
        assert.equal(result.budget.sessions_opened, 0); assert.ok(result.index_rows > 0);
      } finally { process.env = oldEnv; globalThis.fetch = originalFetch; }
    } finally {
      if (oldScrape == null) delete process.env.SCRAPE_ENABLED; else process.env.SCRAPE_ENABLED = oldScrape;
      if (oldDemo == null) delete process.env.SYNTHETIC_DEMO_ENABLED; else process.env.SYNTHETIC_DEMO_ENABLED = oldDemo;
    }
  } finally {
    child?.stdin.end();
    reader?.close();
    child?.kill();
    await memory?.close();
  }
});
