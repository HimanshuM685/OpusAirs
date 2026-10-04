import { readFileSync } from "node:fs";
import { join } from "node:path";
import { constructIndex } from "./apix";
import {
  authJson,
  adminConfigured,
  adminSeedEmail,
  createUser,
  findUserByEmail,
  getUser,
  isAuthResponse,
  loginAdmin,
  makeAdminCookie,
  makeAdminLogoutCookie,
  makeLogoutCookie,
  makeSessionCookie,
  normalizeLoginEmail,
  requireAdmin,
  verifyPassword,
} from "./auth";
import { computeBacktest } from "./backtest";
import { APIX_BASE_DATE, bootstrap, loadPsdBasket } from "./bootstrap";
import { readCache, writeCache } from "./http-cache";
import { enqueue, readJob, recentJobs } from "./jobs";
import { cleanQuotes } from "./cleaning";
import { collectors } from "./collect/sources";
import { robotsVerdict } from "./collect/robots";
import { istDate } from "./collect/policy";
import { collectionHealth } from "./collect/health";
import { snapshotCoverage } from "./snapshot";
import { dataDir, isoDate, isoDateTime, sql } from "./db";
import { ingestQuotes, parseCsvQuotes, displayFlightNo, normalizeTripType, type QuoteIn } from "./ingest";
import { neededQuotes } from "./needed";
import { parseDump } from "./parse-dump";
import { DEFAULT_CSV_TEMPLATE } from "./seeds";

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

async function loginResponse(emailRaw: string | undefined, password: string | undefined, adminOnly: boolean) {
  const email = normalizeLoginEmail(emailRaw || "");
  if (!email || !password) return json({ detail: "Email and password required" }, 400);
  if (adminSeedEmail() && email === adminSeedEmail()) {
    return json({ detail: "Invalid email or password" }, 401);
  }
  const user = await findUserByEmail(email);
  if (!user || !verifyPassword(password, user.password_hash)) {
    return json({ detail: "Invalid email or password" }, 401);
  }
  if (adminOnly && user.role !== "admin") {
    return json({ detail: "Admin required" }, 403);
  }
  return authJson({ success: true, user: { id: user.id, email: user.email, role: user.role } }, makeSessionCookie(user.id));
}

export async function handleV1(req: Request, parts: string[]): Promise<Response> {
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
    const hit = readCache(cacheKey, 10 * 60 * 1000);
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
    const cached = readCache(cacheKey, 10 * 60 * 1000);
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
    const cached = readCache(cacheKey, 10 * 60 * 1000);
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
    const limit = Math.min(Number(sp.get("limit") || 50), 200);
    if (!validIata(origin) || !validIata(dest)) {
      return json({ detail: "origin and dest must be 3-letter IATA codes" }, 400);
    }

    async function searchRows() {
      const rows = (await q`
        SELECT carrier, flight_no, dep_date, fare_class, lead_time_days, base_fare, taxes, udf,
               convenience, total_fare, collected_on, trip_type, return_date
        FROM quotes_clean
        WHERE origin = ${origin} AND destination = ${dest} AND is_outlier = 0
          AND COALESCE(trip_type, 'one_way') = ${trip}
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
    let body: { origin?: string; dest?: string; scrape?: boolean; full?: boolean; demo?: boolean } = {};
    try {
      const text = await req.text();
      if (text) body = JSON.parse(text) as typeof body;
    } catch {
      return json({ detail: "Invalid JSON" }, 400);
    }
    const scrape = body.scrape !== false && sp.get("scrape") !== "false";
    const origin = iata(body.origin || sp.get("origin"));
    const dest = iata(body.dest || sp.get("dest"));
    if ((origin || dest) && (!validIata(origin) || !validIata(dest))) return json({ detail: "origin and dest must be 3-letter IATA codes" }, 400);
    if (body.demo && process.env.SYNTHETIC_DEMO_ENABLED !== "true") return json({ detail: "Set SYNTHETIC_DEMO_ENABLED=true to enable demo snapshots" }, 400);
    const routes = validIata(origin) && validIata(dest) ? [{ origin, destination: dest }] : undefined;
    const snapshotAt = new Date().toISOString();
    const id = await enqueue(q, "collect", { scrape, routes, demo: body.demo === true,
      full: true, slot: "adhoc", snapshotAt, day: istDate(new Date(snapshotAt)) });
    return json({ job_id: id }, 202);
  }

  if (req.method === "GET" && path === "collect/sources") {
    const admin = await requireAdmin(req);
    if (isAuthResponse(admin)) return admin;
    const configured = (await q`SELECT id, enabled FROM scrape_sources`) as { id: string; enabled: boolean }[];
    const byId = new Map(configured.map((s) => [s.id, s.enabled]));
    const sources = await Promise.all(collectors(q, istDate()).map(async (a) => {
      const enabled = byId.get(a.id) === true;
      const robots = a.kind === "skip" ? { verdict: "deny", notes: a.skippedReason, checked_at: null }
        : a.host && a.searchPath && enabled ? await robotsVerdict(`https://${a.host}${a.searchPath}`)
        : { verdict: a.host ? "disabled" : "not_applicable", notes: a.host ? "adapter disabled" : "offline source", checked_at: null };
      return { id: a.id, kind: a.kind, host: a.host || null, source_rank: a.sourceRank, enabled,
        runnable: enabled && a.enabled(), skipped_reason: a.skippedReason || null, robots };
    }));
    return json({ scrape_enabled: process.env.SCRAPE_ENABLED === "true", sources });
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
    const id = await enqueue(q, "ingest", { chars: body.text?.length ?? 0, n: body.quotes?.length ?? 0 }, async () => {
      let quotes = body.quotes;
      if (!quotes?.length) quotes = await parseDump(body.text || "");
      if (!quotes.length) return { detail: "No quotes parsed" };
      return await ingestQuotes(q, quotes, body.rebuild_index !== false);
    });
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
    if (!body.quotes?.length) return json({ detail: "quotes array is empty" }, 400);
    const id = await enqueue(q, "ingest", { n: body.quotes.length }, async () =>
      ingestQuotes(q, body.quotes || [], body.rebuild_index !== false),
    );
    return json({ job_id: id }, 202);
  }

  if (req.method === "POST" && path === "ingest/csv") {
    const denied = await requireWriter(req);
    if (denied) return denied;
    if (!ingestAllowed()) return json({ detail: "Ingest rate limit" }, 429);
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) return json({ detail: "file required" }, 400);
    const text = await file.text();
    const id = await enqueue(q, "ingest", { file: file.name }, async () => {
      const quotes = parseCsvQuotes(text);
      if (!quotes.length) return { detail: "No valid quote rows in CSV" };
      return ingestQuotes(q, quotes, sp.get("rebuild_index") !== "false");
    });
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
    const id = await enqueue(q, "rebuild", { vintage }, async () => {
      const index_rows = await constructIndex(q);
      return { index_rows, vintage };
    });
    return json({ job_id: id }, 202);
  }

  if (req.method === "POST" && path === "auth/register") {
    try {
      const body = (await req.json()) as { email?: string; password?: string };
      const email = (body.email || "").trim().toLowerCase();
      const password = body.password || "";
      if (!email.includes("@") || password.length < 6) {
        return json({ detail: "Valid email and password (min 6 chars) required" }, 400);
      }
      if (adminSeedEmail() && email === adminSeedEmail()) {
        return json({ detail: "Email already registered" }, 409);
      }
      if (await findUserByEmail(email)) {
        return json({ detail: "Email already registered" }, 409);
      }
      const user = await createUser(email, password);
      return authJson({ success: true, user }, makeSessionCookie(user.id), 201);
    } catch {
      return json({ detail: "Invalid request" }, 400);
    }
  }

  if (req.method === "POST" && path === "auth/login") {
    try {
      const body = (await req.json()) as { email?: string; password?: string };
      return await loginResponse(body.email, body.password, false);
    } catch {
      return json({ detail: "Invalid request" }, 400);
    }
  }

  if (req.method === "POST" && path === "auth/logout") {
    return authJson({ success: true }, makeLogoutCookie());
  }

  if (req.method === "GET" && path === "auth/me") {
    const user = await getUser(req);
    if (!user) return json({ authenticated: false }, 200);
    return json({ authenticated: true, user });
  }

  if (req.method === "POST" && path === "admin/login") {
    try {
      const body = (await req.json()) as { email?: string; password?: string };
      if (!adminConfigured()) return json({ detail: "Admin is not configured" }, 401);
      if (!loginAdmin(body.email || "", body.password || "")) {
        return json({ detail: "Invalid email or password" }, 401);
      }
      return authJson(
        { success: true, user: { email: adminSeedEmail(), role: "admin" } },
        makeAdminCookie(),
      );
    } catch {
      return json({ detail: "Invalid request" }, 400);
    }
  }

  if (req.method === "POST" && path === "admin/logout") {
    return authJson({ success: true }, makeAdminLogoutCookie());
  }

  if (req.method === "GET" && path === "admin/check") {
    const admin = await requireAdmin(req);
    if (isAuthResponse(admin)) return json({ authenticated: false });
    return json({ authenticated: true, email: admin.email });
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
