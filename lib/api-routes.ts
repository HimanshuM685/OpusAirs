import { readFileSync } from "node:fs";
import { join } from "node:path";
import { getUser, isAuthResponse, requireAdmin, requireUser } from "./auth";
import { clearProofs } from "./auth/policy";
import { getAuth } from "./auth/server";
import { computeBacktest } from "./backtest";
import { APIX_BASE_DATE, bootstrap, loadPsdBasket } from "./bootstrap";
import { readCache, writeCache } from "./http-cache";
import { enqueue, readJob, recentJobs } from "./jobs";
import { collectors } from "./collect/sources";
import { collectionSources } from "./collect/registry";
import { istDate } from "./collect/policy";
import { collectionHealth } from "./collect/health";
import { snapshotCoverage } from "./snapshot";
import { dataDir, isoDate, isoDateTime, sql } from "./db";
import { displayFlightNo, normalizeTripType, type QuoteIn } from "./ingest";
import { neededQuotes } from "./needed";
import { DEFAULT_CSV_TEMPLATE } from "./seeds";
import { cancelCollection, cancelSchedule, CollectionInputError, createCollectionSchedule, listCollectionSchedules, queueCollection, readCollectionSettings, updateCollectionSettings, validateSettings, validCollectionMode } from "./collect/control";
import { collectionMonitor } from "./collect/monitor";

function json(data: unknown, status = 200) {
  return Response.json(data, { status });
}

const ingestHits: number[] = [];
function ingestAllowed(): boolean {
  const now = Date.now();
  while (ingestHits.length && now - ingestHits[0] > 60_000) ingestHits.shift();
  if (ingestHits.length >= 30) return false;
  ingestHits.push(now);
  return true;
}

async function requireWriter(req: Request): Promise<Response | null> {
  const key = process.env.INGEST_API_KEY;
  const header = req.headers.get("x-api-key");
  if (key && header && header === key) return null;
  const admin = await requireAdmin(req);
  if (isAuthResponse(admin)) return admin;
  return null;
}

async function remember(key: string, body: unknown) {
  writeCache(key, body);
  return json(body);
}

function qnum(sp: URLSearchParams, key: string): number | null {
  const v = sp.get(key);
  return v == null || v === "" ? null : Number(v);
}

function iata(value: string | null | undefined): string {
  return (value || "").trim().toUpperCase();
}

function validIata(code: string): boolean {
  return /^[A-Z]{3}$/.test(code);
}

export async function handleV1(req: Request, parts: string[]): Promise<Response> {
  // Session reads and sign-out do not depend on warehouse bootstrap/database access.
  const authPath = parts.join("/");
  if (req.method === "POST" && ["auth/login", "auth/register", "admin/login"].includes(authPath)) {
    return json({ detail: "Use Neon Auth at /api/auth; admin access requires Google sign-in" }, 410);
  }
  if (req.method === "POST" && ["auth/logout", "admin/logout"].includes(authPath)) {
    const response = await getAuth().handler().POST(req, { params: Promise.resolve({ path: ["sign-out"] }) });
    clearProofs(response);
    return response;
  }
  if (req.method === "GET" && ["auth/me", "admin/check"].includes(authPath)) {
    const user = await getUser(req);
    if (authPath === "auth/me") return json(user ? { authenticated: true, user } : { authenticated: false });
    const isAdmin = user?.role === "admin";
    return json({ authenticated: Boolean(user), isAdmin, email: user?.email, name: user?.name,
      detail: user && !isAdmin ? "Admin access requires a verified Google sign-in and an email listed in ADMIN_EMAILS." : undefined });
  }
  // Authorize before warehouse bootstrap, cache lookup, or database work.
  const analytics = ["index", "quotes", "search", "routes", "trends", "heatmap", "elasticity", "health"];
  const userRead = req.method === "GET" && analytics.includes(parts[0]) && authPath !== "health/collection";
  if (userRead) {
    const user = await requireUser(req);
    if (isAuthResponse(user)) return user;
  } else {
    const machine = ["collect/run", "ingest/quotes", "ingest/csv", "ingest/dump", "index/rebuild"].includes(authPath)
      || (req.method === "GET" && parts[0] === "jobs");
    const denied = machine ? await requireWriter(req) : await requireAdmin(req);
    if (denied instanceof Response) return denied;
  }
  await bootstrap();
  const q = sql();
  const url = new URL(req.url);
  const sp = url.searchParams;
  const path = parts.join("/");

  if (req.method === "GET" && path === "index") {
    const frequency = sp.get("frequency") || "daily";
    const includeAll = sp.get("include") === "all";
    const series = sp.get("series") || "apix_laspeyres";
    const cacheKey = `index:${frequency}:${includeAll ? "all" : series}`;
    const hit = readCache(cacheKey, 20000);
    if (hit) return json(hit);
    const rows = includeAll
      ? await q`
          SELECT series, frequency, period_date, origin, destination, value, imputed_share, coverage, vintage, n_quotes
          FROM index_values
          WHERE frequency = ${frequency} AND origin IS NULL
          ORDER BY period_date, series
        `
      : await q`
          SELECT series, frequency, period_date, origin, destination, value, imputed_share, coverage, vintage, n_quotes
          FROM index_values
          WHERE frequency = ${frequency} AND series = ${series} AND origin IS NULL
          ORDER BY period_date
        `;
    return remember(cacheKey, rows.map(mapIndex));
  }

  if (req.method === "GET" && parts[0] === "index" && parts[1] === "routes" && parts.length === 4) {
    const origin = parts[2].toUpperCase();
    const dest = parts[3].toUpperCase();
    const frequency = sp.get("frequency") || "daily";
    const rows = await q`
      SELECT series, frequency, period_date, origin, destination, value, imputed_share, coverage, vintage, n_quotes
      FROM index_values
      WHERE frequency = ${frequency} AND series = 'apix_route'
        AND origin = ${origin} AND destination = ${dest}
      ORDER BY period_date
    `;
    const basket = loadPsdBasket();
    const weight = basket.find((r) => r.origin === origin && r.destination === dest)?.weight ?? 0;
    return json(rows.map((r) => {
      const row = mapIndex(r);
      const value = Number(row.value);
      return { ...row, contribution: Math.round(weight * (value / 100 - 1) * 10000) / 10000 };
    }));
  }

  if (req.method === "GET" && path === "quotes") {
    const origin = sp.get("origin")?.toUpperCase() || null;
    const dest = sp.get("dest")?.toUpperCase() || null;
    const carrier = sp.get("carrier")?.toUpperCase() || null;
    const lead = qnum(sp, "lead_time");
    const collected = sp.get("collected_on");
    const limit = Math.min(Number(sp.get("limit") || 200), 2000);
    const rows = await q`
      SELECT source, origin, destination, carrier, flight_no, dep_date, fare_class, lead_time_days,
             collected_on, base_fare, taxes, udf, convenience, total_fare, is_outlier, is_imputed,
             trip_type, return_date
      FROM quotes_clean
      WHERE (${origin}::text IS NULL OR origin = ${origin})
        AND (${dest}::text IS NULL OR destination = ${dest})
        AND (${carrier}::text IS NULL OR carrier = ${carrier})
        AND (${lead}::int IS NULL OR lead_time_days = ${lead})
        AND (${collected}::date IS NULL OR collected_on = ${collected})
      ORDER BY collected_on DESC
      LIMIT ${limit}
    `;
    return json(rows.map(mapQuote));
  }

  if (req.method === "GET" && path === "heatmap") {
    const lead = qnum(sp, "lead_time");
    const cacheKey = `heatmap:${lead ?? "all"}`;
    const cached = readCache(cacheKey, 20000);
    if (cached) return json(cached);
    if (lead == null) {
      const rows = await q`
        SELECT origin, destination, period_date, value FROM index_values
        WHERE series = 'apix_route' AND frequency = 'daily' AND origin IS NOT NULL
      `;
      const body = rows.map((r) => ({
        origin: r.origin,
        destination: r.destination,
        period_date: isoDate(r.period_date),
        value: r.value,
        imputed: false,
      }));
      return remember(cacheKey, body);
    }
    const rows = (await q`
      SELECT origin, destination, collected_on, total_fare FROM quotes_clean
      WHERE is_outlier = 0 AND lead_time_days = ${lead}
    `) as { origin: string; destination: string; collected_on: string; total_fare: number }[];
    const cells = new Map<string, number[]>();
    for (const r of rows) {
      const key = `${r.origin}|${r.destination}|${isoDate(r.collected_on)}`;
      const list = cells.get(key) ?? [];
      list.push(r.total_fare);
      cells.set(key, list);
    }
    const body = [...cells.entries()].sort().map(([key, vals]) => {
      const [origin, destination, period_date] = key.split("|");
      return { origin, destination, period_date, lead_time_days: lead, value: Math.min(...vals), imputed: false };
    });
    return remember(cacheKey, body);
  }

  if (req.method === "GET" && path === "elasticity") {
    const origin = sp.get("origin")?.toUpperCase() || null;
    const dest = sp.get("dest")?.toUpperCase() || null;
    const rows = (await q`
      SELECT origin, destination, lead_time_days, total_fare FROM quotes_clean
      WHERE is_outlier = 0
        AND (${origin}::text IS NULL OR origin = ${origin})
        AND (${dest}::text IS NULL OR destination = ${dest})
    `) as { origin: string; destination: string; lead_time_days: number; total_fare: number }[];
    const buckets = new Map<string, number[]>();
    for (const r of rows) {
      const key = `${origin ? r.origin : ""}|${dest ? r.destination : ""}|${r.lead_time_days}`;
      const list = buckets.get(key) ?? [];
      list.push(r.total_fare);
      buckets.set(key, list);
    }
    return json(
      [...buckets.entries()]
        .sort((a, b) => Number(a[0].split("|")[2]) - Number(b[0].split("|")[2]))
        .map(([key, vals]) => {
          const [o, d, lt] = key.split("|");
          return {
            origin: o || null,
            destination: d || null,
            lead_time_days: Number(lt),
            mean_total_fare: Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 100) / 100,
          };
        }),
    );
  }

  if (req.method === "GET" && path === "health/collection") {
    const admin = await requireAdmin(req);
    if (isAuthResponse(admin)) return admin;
    return json(await collectionHealth(q));
  }

  if (req.method === "GET" && path === "collect/jobs") {
    const admin = await requireAdmin(req);
    if (isAuthResponse(admin)) return admin;
    const day = sp.get("date") || istDate();
    const rows = (await q`
      SELECT status, COUNT(*)::int AS n FROM collect_jobs WHERE collected_on = ${day} GROUP BY status
    `) as { status: string; n: number }[];
    const counts: Record<string, number> = { pending: 0, running: 0, done: 0, blocked: 0, missing: 0, failed: 0 };
    for (const r of rows) counts[r.status] = Number(r.n);
    const routes = (await q`
      SELECT COUNT(*)::int AS n FROM (
        SELECT DISTINCT origin, destination FROM collect_jobs WHERE collected_on = ${day}
      ) s
    `) as { n: number }[];
    const okRoutes = (await q`
      SELECT COUNT(*)::int AS n FROM (
        SELECT DISTINCT origin, destination FROM collect_jobs WHERE collected_on = ${day} AND status = 'done'
      ) s
    `) as { n: number }[];
    return json({ collected_on: day, ...counts, routes: Number(routes[0]?.n || 0), routes_ok: Number(okRoutes[0]?.n || 0) });
  }

  if (req.method === "GET" && path === "routes") {
    const cacheKey = "routes:list";
    const cached = readCache(cacheKey, 20000);
    if (cached) return json(cached);
    const routes = (await q`SELECT origin, destination, weight, raw_passengers FROM basket_routes ORDER BY weight DESC`) as {
      origin: string;
      destination: string;
      weight: number;
      raw_passengers: number;
    }[];
    const idx = (await q`
      SELECT origin, destination, value, period_date,
        ROW_NUMBER() OVER (PARTITION BY origin, destination ORDER BY period_date DESC) AS rn
      FROM index_values
      WHERE series = 'apix_route' AND frequency = 'daily' AND origin IS NOT NULL
    `) as { origin: string; destination: string; value: number; period_date: string; rn: number }[];
    const latestBy = new Map<string, number>();
    const prevBy = new Map<string, number>();
    for (const r of idx) {
      const key = `${r.origin}|${r.destination}`;
      const rn = Number(r.rn);
      if (rn === 1) latestBy.set(key, Number(r.value));
      else if (rn === 2) prevBy.set(key, Number(r.value));
    }
    const fares = (await q`
      SELECT DISTINCT ON (origin, destination) origin, destination, total_fare
      FROM quotes_clean
      WHERE is_outlier = 0
      ORDER BY origin, destination, collected_on DESC
    `) as { origin: string; destination: string; total_fare: number }[];
    const fareBy = new Map(fares.map((f) => [`${f.origin}|${f.destination}`, Number(f.total_fare)]));
    return remember(cacheKey,
      routes.map((r) => {
        const key = `${r.origin}|${r.destination}`;
        return {
          origin: r.origin,
          destination: r.destination,
          weight: r.weight,
          raw_passengers: r.raw_passengers,
          latest_index: latestBy.get(key) ?? null,
          prev_index: prevBy.get(key) ?? null,
          latest_fare: fareBy.get(key) ?? null,
          contribution:
            latestBy.get(key) != null
              ? Math.round(r.weight * (Number(latestBy.get(key)) / 100 - 1) * 10000) / 10000
              : null,
          wow: null,
          yoy: null,
          coverage: null,
          best_lead_bin: null,
        };
      }),
    );
  }

  if (req.method === "GET" && path === "backtest/dgca") {
    const admin = await requireAdmin(req);
    if (isAuthResponse(admin)) return admin;
    return json(await computeBacktest(q));
  }

  if (req.method === "GET" && path === "search") {
    const origin = iata(sp.get("origin"));
    const dest = iata(sp.get("dest"));
    const trip = normalizeTripType(sp.get("trip_type") || sp.get("trip"));
    const limit = Math.min(Math.max(Number(sp.get("limit")) || 50, 1), 200);
    const departure = sp.get("dep_date") || null;
    const cabin = sp.get("cabin") || null;
    if (departure && (!/^\d{4}-\d{2}-\d{2}$/.test(departure) || !Number.isFinite(Date.parse(departure)))) return json({ detail: "Use a valid YYYY-MM-DD departure date" }, 400);
    if (cabin && !["ECONOMY", "PREMIUM_ECONOMY", "BUSINESS"].includes(cabin)) return json({ detail: "Choose a supported cabin" }, 400);
    if (!validIata(origin) || !validIata(dest) || origin === dest) {
      return json({ detail: "origin and dest must be 3-letter IATA codes" }, 400);
    }

    async function searchRows() {
      const rows = (await q`
        SELECT carrier, flight_no, dep_date, fare_class, lead_time_days, base_fare, taxes, udf,
               convenience, total_fare, collected_on, trip_type, return_date
        FROM quotes_clean
        WHERE origin = ${origin} AND destination = ${dest} AND is_outlier = 0
           AND COALESCE(trip_type, 'one_way') = ${trip}
           AND (${departure}::date IS NULL OR dep_date = ${departure}::date)
           AND (${cabin}::text IS NULL OR REPLACE(UPPER(fare_class), ' ', '_') = ${cabin})
        ORDER BY total_fare ASC
        LIMIT ${limit}
      `) as Record<string, unknown>[];
      return rows.map((r) => ({
        ...r,
        flight_no: displayFlightNo(r.flight_no),
        dep_date: isoDate(r.dep_date),
        collected_on: isoDate(r.collected_on),
        return_date: r.return_date ? isoDate(r.return_date) : null,
        trip_type: r.trip_type || trip,
      })) as (Record<string, unknown> & { total_fare?: number })[];
    }

    const carriers = await searchRows();

    return json({
      origin,
      destination: dest,
      cheapest: carriers[0]?.total_fare ?? null,
      carriers,
      quote_count: carriers.length,
      fetched: false,
      trip_type: trip,
    });
  }

  if (req.method === "GET" && parts[0] === "trends" && parts.length === 3) {
    const origin = parts[1].toUpperCase();
    const dest = parts[2].toUpperCase();
    const window = sp.get("window") || "30d";
    const trip = sp.get("trip_type");
    const days = window === "3m" ? 90 : window === "6m" ? 180 : window === "all" ? 36500 : 30;
    const since = new Date();
    since.setUTCDate(since.getUTCDate() - days);
    const sinceStr = since.toISOString().slice(0, 10);
    const rows = (await q`
      SELECT dep_date, collected_on, total_fare, trip_type FROM quotes_clean
      WHERE origin = ${origin} AND destination = ${dest} AND is_outlier = 0
      ORDER BY dep_date
    `) as { dep_date: string; collected_on: string; total_fare: number; trip_type?: string }[];
    const byCollect = new Set(rows.map((r) => isoDate(r.collected_on)));
    const useDep = byCollect.size <= 1;
    const buckets = new Map<string, number[]>();
    for (const r of rows) {
      if (trip && (r.trip_type || "one_way") !== trip) continue;
      const day = isoDate(useDep ? r.dep_date : r.collected_on);
      if (day < sinceStr) continue;
      const list = buckets.get(day) ?? [];
      list.push(Number(r.total_fare));
      buckets.set(day, list);
    }
    return json(
      [...buckets.entries()].sort().map(([period_date, fares]) => ({
        period_date,
        avg_fare: Math.round((fares.reduce((a, b) => a + b, 0) / fares.length) * 100) / 100,
        min_fare: Math.min(...fares),
        max_fare: Math.max(...fares),
        quote_count: fares.length,
      })),
    );
  }

  if (req.method === "POST" && path === "collect/run") {
    const denied = await requireWriter(req);
    if (denied) return denied;
    let body: { origin?: string; dest?: string; scrape?: boolean; full?: boolean; demo?: boolean; transportMode?: string; settings?: unknown } = {};
    try {
      const text = await req.text();
      if (text) body = JSON.parse(text) as typeof body;
      if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error("Invalid object");
    } catch {
      return json({ detail: "Invalid JSON" }, 400);
    }
    const scrape = body.scrape !== false && sp.get("scrape") !== "false";
    // Per-run settings from the admin form apply to this run only; saved defaults stay untouched.
    let settings;
    try { settings = body.settings ? validateSettings(body.settings) : await readCollectionSettings(q); }
    catch (error) { if (error instanceof CollectionInputError) return json({ detail: error.message }, 400); throw error; }
    const transportMode = !scrape ? "offline" : body.transportMode || settings.transport_mode;
    if (!validCollectionMode(transportMode)) return json({ detail: "transportMode must be tinyfish, http, or offline" }, 400);
    const origin = iata(body.origin || sp.get("origin"));
    const dest = iata(body.dest || sp.get("dest"));
    if ((origin || dest) && (!validIata(origin) || !validIata(dest))) return json({ detail: "origin and dest must be 3-letter IATA codes" }, 400);
    if (body.demo && process.env.SYNTHETIC_DEMO_ENABLED !== "true") return json({ detail: "Set SYNTHETIC_DEMO_ENABLED=true to enable demo snapshots" }, 400);
    const routes = validIata(origin) && validIata(dest) ? [{ origin, destination: dest }] : undefined;
    const snapshotAt = new Date().toISOString();
    const queued = await queueCollection(q, { scrape: scrape && transportMode !== "offline", routes, demo: body.demo === true,
      transportMode, settings: { ...settings, transport_mode: transportMode }, full: true, slot: "adhoc", snapshotAt, day: istDate(new Date(snapshotAt)), requestedBy: (await getUser(req))?.id || "machine" });
    return json({ job_id: queued.id, existing: queued.existing, transport_mode: transportMode }, 202);
  }

  if (req.method === "GET" && path === "collect/monitor") {
    const selected = sp.get("job") || undefined;
    if (selected && !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(selected)) return json({ detail: "Invalid job ID" }, 400);
    return json(await collectionMonitor(q, selected));
  }

  if (req.method === "GET" && path === "collect/control") {
    const admin = await requireAdmin(req);
    if (isAuthResponse(admin)) return admin;
    return json({ settings: await readCollectionSettings(q), schedules: await listCollectionSchedules(q) });
  }

  if (req.method === "POST" && path === "collect/control") {
    const admin = await requireAdmin(req);
    if (isAuthResponse(admin)) return admin;
    let body: { action?: string; run_at?: string; transport_mode?: string; recurrence?: string; schedule_id?: string;
      max_sessions?: number; max_agent_runs?: number; max_hours?: number; job_id?: string };
    try { body = await req.json(); if (!body || typeof body !== "object") throw new Error(); }
    catch { return json({ detail: "Supply a JSON object" }, 400); }
    try {
    if (body.action === "settings") {
      return json({ settings: await updateCollectionSettings(q, { transport_mode: body.transport_mode, max_sessions: body.max_sessions,
        max_agent_runs: body.max_agent_runs, max_hours: body.max_hours }) });
    }
    if (body.action === "schedule") {
      const runAt = new Date(body.run_at || "");
      if (Number.isNaN(runAt.getTime())) return json({ detail: "run_at must be an ISO date-time" }, 400);
      const mode = body.transport_mode || (await readCollectionSettings(q)).transport_mode;
      if (!validCollectionMode(mode)) return json({ detail: "transport_mode must be tinyfish, http, or offline" }, 400);
      return json({ schedule: await createCollectionSchedule(q, { runAt: runAt.toISOString(), mode, recurrence: body.recurrence, requestedBy: admin.id }) }, 202);
    }
    if (body.action === "cancel_schedule" && body.schedule_id) {
      if (!/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(body.schedule_id)) return json({ detail: "Invalid schedule ID" }, 400);
      return json({ cancelled: Boolean((await cancelSchedule(q, body.schedule_id)).length) });
    }
    if (body.action === "cancel" && body.job_id) {
      if (!/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(body.job_id)) return json({ detail: "Invalid job_id" }, 400);
      return json({ cancelled: await cancelCollection(q, body.job_id) });
    }
    if (body.action === "retry" && body.job_id) {
      if (!/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(body.job_id)) return json({ detail: "Invalid job ID" }, 400);
      const previous = (await q`SELECT status, payload FROM pipeline_jobs WHERE id = ${body.job_id} AND type = 'collect'`)[0];
      if (!previous) return json({ detail: "Job not found" }, 404);
      if (!["error", "cancelled"].includes(previous.status)) return json({ detail: "Only failed or cancelled runs can be retried. Stop an active job first." }, 409);
      const saved = previous.payload || {};
      const settings = saved.settings || await readCollectionSettings(q); const at = new Date();
      const transportMode = saved.scrape === false ? "offline" : saved.transportMode || settings.transport_mode;
      const queued = await queueCollection(q, { transportMode, settings: { ...settings, transport_mode: transportMode }, routes: saved.routes, demo: saved.demo === true, retryOf: body.job_id,
        snapshotAt: at.toISOString(), day: istDate(at), slot: "retry", requestedBy: admin.id }, `retry:${body.job_id}`);
      return json({ job_id: queued.id, existing: queued.existing }, 202);
    }
    return json({ detail: "Use settings, schedule, cancel_schedule, cancel, or retry" }, 400);
    } catch (error) { if (error instanceof CollectionInputError) return json({ detail: error.message }, 400); throw error; }
  }

  if (req.method === "GET" && path === "collect/sources") {
    const admin = await requireAdmin(req);
    if (isAuthResponse(admin)) return admin;
    return json(await collectionSources(q));
  }

  if (req.method === "POST" && path === "collect/discover") {
    const admin = await requireAdmin(req);
    if (isAuthResponse(admin)) return admin;
    const id = await enqueue(q, "discover", { day: istDate() });
    return json({ job_id: id }, 202);
  }

  if (req.method === "POST" && path === "collect/sources") {
    const admin = await requireAdmin(req);
    if (isAuthResponse(admin)) return admin;
    const body = (await req.json()) as { id?: string; enabled?: boolean };
    const adapter = collectors(q, istDate()).find((a) => a.id === body.id);
    if (!adapter || typeof body.enabled !== "boolean") return json({ detail: "Known adapter id and boolean enabled required" }, 400);
    if (adapter.kind === "skip" && body.enabled) return json({ detail: adapter.skippedReason }, 409);
    await q`UPDATE scrape_sources SET enabled = ${body.enabled} WHERE id = ${adapter.id}`;
    return json({ id: adapter.id, enabled: body.enabled });
  }

  if (req.method === "POST" && path === "ingest/dump") {
    const denied = await requireWriter(req);
    if (denied) return denied;
    if (!ingestAllowed()) return json({ detail: "Ingest rate limit" }, 429);
    const body = (await req.json()) as { text?: string; quotes?: QuoteIn[]; rebuild_index?: boolean };
    if ((!body.text?.trim() && !body.quotes?.length) || (body.text?.length || 0) > 500000 || (body.quotes?.length || 0) > 2000) return json({ detail: "Supply fare data: up to 500,000 text characters or 2,000 quotes per job" }, 400);
    const id = await enqueue(q, "ingest", { mode: "dump", text: body.text || null, quotes: body.quotes || null,
      rebuild_index: body.rebuild_index !== false, chars: body.text?.length ?? 0, n: body.quotes?.length ?? 0 });
    return json({ job_id: id }, 202);
  }

  if (req.method === "GET" && path === "ingest/needed") {
    const admin = await requireAdmin(req);
    if (isAuthResponse(admin)) return admin;
    const needed = await neededQuotes(q);
    return json({
      needed,
      count: needed.length,
      fields: [
        "origin",
        "destination",
        "dep_date",
        "total_fare",
        "trip_type (one_way|round_trip)",
        "optional: carrier, flight_no, return_date, lead_time_days, collected_on, base_fare, taxes, udf, convenience",
      ],
    });
  }

  if (req.method === "POST" && path === "ingest/quotes") {
    const denied = await requireWriter(req);
    if (denied) return denied;
    if (!ingestAllowed()) return json({ detail: "Ingest rate limit" }, 429);
    const body = (await req.json()) as { quotes?: QuoteIn[]; rebuild_index?: boolean };
    if (!Array.isArray(body.quotes) || !body.quotes.length || body.quotes.length > 2000) return json({ detail: "Supply 1–2,000 quotes per job" }, 400);
    const id = await enqueue(q, "ingest", { mode: "quotes", quotes: body.quotes, rebuild_index: body.rebuild_index !== false, n: body.quotes.length });
    return json({ job_id: id }, 202);
  }

  if (req.method === "POST" && path === "ingest/csv") {
    const denied = await requireWriter(req);
    if (denied) return denied;
    if (!ingestAllowed()) return json({ detail: "Ingest rate limit" }, 429);
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) return json({ detail: "file required" }, 400);
    if (file.size > 2 * 1024 * 1024) return json({ detail: "Choose a CSV file smaller than 2 MB" }, 413);
    const text = await file.text();
    const id = await enqueue(q, "ingest", { mode: "csv", file: file.name, text, rebuild_index: sp.get("rebuild_index") !== "false" });
    return json({ job_id: id }, 202);
  }

  if (req.method === "GET" && path === "ingest/template") {
    let text = DEFAULT_CSV_TEMPLATE;
    try {
      text = readFileSync(join(dataDir(), "quotes_manual.example.csv"), "utf8");
    } catch {
      /* fallback to DEFAULT_CSV_TEMPLATE */
    }
    return new Response(text, { headers: { "Content-Type": "text/csv" } });
  }

  if (req.method === "POST" && path === "index/rebuild") {
    const denied = await requireWriter(req);
    if (denied) return denied;
    const vintage = sp.get("vintage") === "final" ? "final" : "provisional";
    const id = await enqueue(q, "rebuild", { vintage });
    return json({ job_id: id }, 202);
  }

  if (req.method === "GET" && path === "health") {
    const idx = (await q`
      SELECT period_date, coverage, imputed_share, quality, vintage FROM index_values
      WHERE series = 'apix_laspeyres' AND frequency = 'daily' AND origin IS NULL
      ORDER BY period_date DESC LIMIT 1
    `) as { period_date: string; coverage: number; imputed_share: number; quality: string; vintage: string }[];
    const snap = (await q`SELECT snapshot_at FROM quote_snapshots ORDER BY snapshot_at DESC LIMIT 1`) as { snapshot_at: string }[];
    const job = (await q`SELECT id, status FROM pipeline_jobs ORDER BY created_at DESC LIMIT 1`) as { id: string; status: string }[];
    const blocked = (await q`
      SELECT source FROM collection_runs WHERE quotes_blocked > 0 ORDER BY started_at DESC LIMIT 8
    `) as { source: string }[];
    const row = idx[0];
    const slotMetrics = snap[0] ? await snapshotCoverage(q, new Date(snap[0].snapshot_at).toISOString()) : null;
    return json({
      ok: Boolean(row),
      last_snapshot_at: snap[0]?.snapshot_at ?? null,
      last_index_date: row ? isoDate(row.period_date) : null,
      coverage: slotMetrics?.coverage ?? 0,
      imputed_share: slotMetrics?.imputed_share ?? 1,
      quality: slotMetrics?.quality ?? "low",
      vintage: slotMetrics?.vintage ?? "provisional",
      blocked_sources: [...new Set(blocked.map((r) => r.source))],
      job: job[0] ? { id: job[0].id, status: job[0].status } : null,
    });
  }

  if (req.method === "GET" && parts[0] === "jobs" && parts.length === 2) {
    const denied = await requireWriter(req);
    if (denied) return denied;
    const job = await readJob(q, parts[1]);
    if (!job) return json({ detail: "Job not found" }, 404);
    return json(job);
  }

  if (req.method === "GET" && path === "jobs") {
    const denied = await requireWriter(req);
    if (denied) return denied;
    return json(await recentJobs(q, 20));
  }

  if (req.method === "GET" && path === "bulletin") {
    const frequency = sp.get("frequency") || "monthly";
    const format = sp.get("format") || "json";
    const rows = (await q`
      SELECT series, frequency, period_date, value, imputed_share, coverage, vintage, n_quotes
      FROM index_values
      WHERE frequency = ${frequency} AND origin IS NULL AND series IN ('apix_laspeyres', 'apix_t21', 'apix_chain', 'apix_laspeyres_ma7')
      ORDER BY period_date, series
    `) as Record<string, unknown>[];
    const latest = rows.filter((r) => r.series === "apix_laspeyres").at(-1);
    const meta = {
      title: "OpusAirs Airfare Price Index bulletin",
      base_date: APIX_BASE_DATE,
      weights: "data/psd_basket.csv",
      frequency,
      coverage: latest ? Number(latest.coverage) : null,
      imputed_share: latest ? Number(latest.imputed_share) : null,
      methodology:
        "National APIx is a passenger-weighted Laspeyres index of one-way economy fares. Missing basket cells are imputed. BUSINESS and round-trip quotes are excluded. CPI air weight is illustrative.",
      values: rows.map(mapIndex),
    };
    if (format === "csv") {
      const lines = [
        `# ${meta.title}`,
        `# base_date=${meta.base_date}`,
        `# weights=${meta.weights}`,
        `# coverage=${meta.coverage ?? ""}`,
        `# imputed_share=${meta.imputed_share ?? ""}`,
        `# ${meta.methodology}`,
        "series,frequency,period_date,value,imputed_share,coverage,vintage,n_quotes",
        ...meta.values.map((r) =>
          [r.series, r.frequency, r.period_date, r.value, r.imputed_share, r.coverage ?? "", r.vintage ?? "", r.n_quotes ?? ""].join(","),
        ),
      ];
      return new Response(lines.join("\n"), {
        headers: { "Content-Type": "text/csv", "Content-Disposition": "attachment; filename=apix-bulletin.csv" },
      });
    }
    return json(meta);
  }

  return json({ detail: `Not found: ${req.method} /v1/${path}` }, 404);
}

function mapIndex(r: Record<string, unknown>): Record<string, unknown> {
  const value = Number(r.value);
  const weight = Number(process.env.CPI_AIR_WEIGHT || 0.004);
  return {
    ...r,
    period_date: isoDate(r.period_date),
    origin: r.origin ?? null,
    destination: r.destination ?? null,
    ...(r.frequency === "monthly" && Number.isFinite(value)
      ? { cpi_contribution_pp: Math.round(weight * (value / 100 - 1) * 100 * 10000) / 10000 }
      : {}),
  };
}

function mapQuote(r: Record<string, unknown>) {
  return {
    ...r,
    flight_no: displayFlightNo(r.flight_no),
    dep_date: isoDate(r.dep_date),
    collected_on: isoDate(r.collected_on),
    return_date: r.return_date ? isoDate(r.return_date) : null,
    trip_type: r.trip_type || "one_way",
  };
}
