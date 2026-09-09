import { readFileSync } from "node:fs";
import { join } from "node:path";
import { constructIndex } from "./apix";
import { computeBacktest } from "./backtest";
import { bootstrap } from "./bootstrap";
import { cleanQuotes } from "./cleaning";
import { runPipeline } from "./collect";
import { dataDir, isoDate, isoDateTime, sql } from "./db";
import { ingestQuotes, parseCsvQuotes, type QuoteIn } from "./ingest";

function json(data: unknown, status = 200) {
  return Response.json(data, { status });
}

function qnum(sp: URLSearchParams, key: string): number | null {
  const v = sp.get(key);
  return v == null || v === "" ? null : Number(v);
}

export async function handleV1(req: Request, parts: string[]): Promise<Response> {
  await bootstrap();
  const q = sql();
  const url = new URL(req.url);
  const sp = url.searchParams;
  const path = parts.join("/");

  if (req.method === "GET" && path === "index") {
    const frequency = sp.get("frequency") || "daily";
    const series = sp.get("series") || "apix_laspeyres";
    const rows = await q`
      SELECT series, frequency, period_date, origin, destination, value, imputed_share
      FROM index_values
      WHERE frequency = ${frequency} AND series = ${series} AND origin IS NULL
      ORDER BY period_date
    `;
    return json(rows.map(mapIndex));
  }

  if (req.method === "GET" && parts[0] === "index" && parts[1] === "routes" && parts.length === 4) {
    const origin = parts[2].toUpperCase();
    const dest = parts[3].toUpperCase();
    const frequency = sp.get("frequency") || "daily";
    const rows = await q`
      SELECT series, frequency, period_date, origin, destination, value, imputed_share
      FROM index_values
      WHERE frequency = ${frequency} AND series = 'apix_route'
        AND origin = ${origin} AND destination = ${dest}
      ORDER BY period_date
    `;
    return json(rows.map(mapIndex));
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
             collected_on, base_fare, taxes, udf, convenience, total_fare, is_outlier, is_imputed
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
    if (lead == null) {
      const rows = await q`
        SELECT origin, destination, period_date, value FROM index_values
        WHERE series = 'apix_route' AND frequency = 'daily' AND origin IS NOT NULL
      `;
      return json(
        rows.map((r) => ({
          origin: r.origin,
          destination: r.destination,
          period_date: isoDate(r.period_date),
          value: r.value,
        })),
      );
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
    return json(
      [...cells.entries()].sort().map(([key, vals]) => {
        const [origin, destination, period_date] = key.split("|");
        return { origin, destination, period_date, lead_time_days: lead, value: Math.min(...vals) };
      }),
    );
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
    const rows = (await q`SELECT * FROM collection_runs ORDER BY started_at DESC`) as Record<string, unknown>[];
    const latest = new Map<string, Record<string, unknown>>();
    for (const r of rows) {
      const src = String(r.source);
      if (!latest.has(src)) latest.set(src, r);
    }
    return json(
      [...latest.values()].map((r) => ({
        source: r.source,
        last_started_at: isoDateTime(r.started_at),
        last_finished_at: isoDateTime(r.finished_at),
        status: r.status,
        quotes_ok: r.quotes_ok,
        quotes_missing: r.quotes_missing,
        quotes_sold_out: r.quotes_sold_out,
        quotes_blocked: r.quotes_blocked,
        notes: r.notes,
      })),
    );
  }

  if (req.method === "GET" && path === "routes") {
    const routes = (await q`SELECT * FROM basket_routes`) as {
      origin: string;
      destination: string;
      weight: number;
      raw_passengers: number;
    }[];
    const out = [];
    for (const r of routes) {
      const latest = await q`
        SELECT value FROM index_values
        WHERE series = 'apix_route' AND frequency = 'daily' AND origin = ${r.origin} AND destination = ${r.destination}
        ORDER BY period_date DESC LIMIT 1
      `;
      const fare = await q`
        SELECT total_fare FROM quotes_clean
        WHERE origin = ${r.origin} AND destination = ${r.destination} AND is_outlier = 0
        ORDER BY collected_on DESC LIMIT 1
      `;
      out.push({
        origin: r.origin,
        destination: r.destination,
        weight: r.weight,
        raw_passengers: r.raw_passengers,
        latest_index: latest[0]?.value ?? null,
        latest_fare: fare[0]?.total_fare ?? null,
      });
    }
    return json(out);
  }

  if (req.method === "GET" && path === "backtest/dgca") {
    return json(await computeBacktest(q));
  }

  if (req.method === "GET" && path === "search") {
    const origin = (sp.get("origin") || "").toUpperCase();
    const dest = (sp.get("dest") || "").toUpperCase();
    const limit = Math.min(Number(sp.get("limit") || 50), 200);
    const rows = (await q`
      SELECT carrier, flight_no, dep_date, fare_class, lead_time_days, base_fare, taxes, udf,
             convenience, total_fare, collected_on
      FROM quotes_clean
      WHERE origin = ${origin} AND destination = ${dest} AND is_outlier = 0
      ORDER BY total_fare ASC
      LIMIT ${limit}
    `) as Record<string, unknown>[];
    const carriers = rows.map((r) => ({
      ...r,
      dep_date: isoDate(r.dep_date),
      collected_on: isoDate(r.collected_on),
    }));
    return json({
      origin,
      destination: dest,
      cheapest: carriers[0]?.total_fare ?? null,
      carriers,
      quote_count: carriers.length,
    });
  }

  if (req.method === "GET" && parts[0] === "trends" && parts.length === 3) {
    const origin = parts[1].toUpperCase();
    const dest = parts[2].toUpperCase();
    const window = sp.get("window") || "30d";
    const today = new Date();
    const days = window === "3m" ? 90 : window === "6m" ? 180 : window === "all" ? 36500 : 30;
    const since = new Date(today);
    since.setUTCDate(since.getUTCDate() - days);
    const sinceStr = since.toISOString().slice(0, 10);
    const rows = (await q`
      SELECT collected_on, total_fare FROM quotes_clean
      WHERE origin = ${origin} AND destination = ${dest} AND is_outlier = 0 AND collected_on >= ${sinceStr}
      ORDER BY collected_on
    `) as { collected_on: string; total_fare: number }[];
    const buckets = new Map<string, number[]>();
    for (const r of rows) {
      const d = isoDate(r.collected_on);
      const list = buckets.get(d) ?? [];
      list.push(r.total_fare);
      buckets.set(d, list);
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
    const scrape = sp.get("scrape") !== "false";
    return json(await runPipeline(scrape));
  }

  if (req.method === "POST" && path === "ingest/quotes") {
    const body = (await req.json()) as { quotes?: QuoteIn[]; rebuild_index?: boolean };
    if (!body.quotes?.length) return json({ detail: "quotes array is empty" }, 400);
    return json(await ingestQuotes(q, body.quotes, body.rebuild_index !== false));
  }

  if (req.method === "POST" && path === "ingest/csv") {
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) return json({ detail: "file required" }, 400);
    const quotes = parseCsvQuotes(await file.text());
    if (!quotes.length) return json({ detail: "No valid quote rows in CSV" }, 400);
    const rebuild = sp.get("rebuild_index") !== "false";
    return json(await ingestQuotes(q, quotes, rebuild));
  }

  if (req.method === "GET" && path === "ingest/template") {
    const text = readFileSync(join(dataDir(), "quotes_manual.example.csv"), "utf8");
    return new Response(text, { headers: { "Content-Type": "text/csv" } });
  }

  if (req.method === "POST" && path === "index/rebuild") {
    const cleaned = await cleanQuotes(q);
    const indexed = await constructIndex(q);
    return json({ cleaned, index_rows: indexed });
  }

  return json({ detail: `Not found: ${req.method} /v1/${path}` }, 404);
}

function mapIndex(r: Record<string, unknown>) {
  return {
    ...r,
    period_date: isoDate(r.period_date),
    origin: r.origin ?? null,
    destination: r.destination ?? null,
  };
}

function mapQuote(r: Record<string, unknown>) {
  return {
    ...r,
    dep_date: isoDate(r.dep_date),
    collected_on: isoDate(r.collected_on),
  };
}
