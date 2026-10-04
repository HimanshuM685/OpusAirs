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

// Opt-in integration test. Only a disposable, explicitly named PostgreSQL container is used.
it("PostgreSQL: idempotent schema, durable slot jobs, raw statuses, snapshots, and demo isolation", {
  skip: !process.env.COLLECT_TEST_POSTGRES_CONTAINER,
  timeout: 120000,
}, async () => {
  const container = process.env.COLLECT_TEST_POSTGRES_CONTAINER!;
  assert.match(container, /^opusairs-collection-test(?:-[a-z0-9]+)?$/);
  const child = spawn("docker", ["exec", "-i", container, "psql", "-U", "postgres", "-qAt", "-v", "ON_ERROR_STOP=1"]);
  const reader = createInterface({ input: child.stdout });
  let sequence = 0;
  let sqlTail: Promise<unknown> = Promise.resolve();
  let error = "";
  let pending: { marker: string; lines: string[]; resolve: (lines: string[]) => void; reject: (err: Error) => void } | null = null;
  child.stderr.on("data", (chunk) => { error += String(chunk); });
  child.on("error", (err) => pending?.reject(err));
  child.on("exit", (code) => { if (code) pending?.reject(new Error(error)); });
  reader.on("line", (line) => {
    if (!pending) return;
    if (line === pending.marker) { const task = pending; pending = null; task.resolve(task.lines); }
    else pending.lines.push(line);
  });
  function execute(text: string): Promise<string[]> {
    const result = sqlTail.then(() => new Promise<string[]>((resolve, reject) => {
      const marker = `__opusairs_end_${++sequence}`;
      pending = { marker, lines: [], resolve, reject };
      child.stdin.write(`${text.replace(/;\s*$/, "")};\n\\echo ${marker}\n`);
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
      quotes_raw, collection_runs, collect_lock, basket_routes, scrape_sources, dgca_benchmark RESTART IDENTITY CASCADE`;
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

    const first = await enqueue(q, "collect", { slot: "0600", snapshotAt: morning }, undefined, `collect:${morning}`);
    assert.equal(await enqueue(q, "collect", {}, undefined, `collect:${morning}`), first);
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
    } finally {
      if (oldScrape == null) delete process.env.SCRAPE_ENABLED; else process.env.SCRAPE_ENABLED = oldScrape;
      if (oldDemo == null) delete process.env.SYNTHETIC_DEMO_ENABLED; else process.env.SYNTHETIC_DEMO_ENABLED = oldDemo;
    }
  } finally {
    child.stdin.end();
    reader.close();
    child.kill();
  }
});
