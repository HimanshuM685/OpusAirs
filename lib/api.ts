export class ApiError extends Error {
  constructor(public readonly status: number, public readonly path: string, message: string) {
    super(message); this.name = "ApiError";
  }
}

export type RequestOptions = { signal?: AbortSignal; cache?: RequestCache; timeoutMs?: number };

export function isAbort(error: unknown): boolean { return error instanceof Error && error.name === "AbortError"; }

async function send<T>(path: string, init: RequestInit, options: RequestOptions): Promise<T> {
  const timeout = AbortSignal.timeout(options.timeoutMs ?? 20000);
  const signal = options.signal ? AbortSignal.any([options.signal, timeout]) : timeout;
  try {
    const response = await fetch(path, { ...init, credentials: "include", cache: "no-store", signal });
    return await readResponse<T>(response, path);
  } catch (error) {
    if (timeout.aborted && !options.signal?.aborted) throw new Error("Request timed out. Check your connection and try again.");
    throw error;
  }
}

async function readResponse<T>(res: Response, path: string): Promise<T> {
  const contentType = res.headers.get("content-type") || "";
  const body = contentType.includes("application/json") ? await res.json().catch(() => null) : await res.text().catch(() => "");
  if (!res.ok) {
    const detail = typeof body === "object" && body && "detail" in body ? String(body.detail) : typeof body === "object" && body && "message" in body ? String(body.message) : String(body || res.statusText);
    if ((res.status === 401 || res.status === 403) && typeof window !== "undefined") {
      clearApiCache();
      window.dispatchEvent(new CustomEvent("session-required", { detail: { status: res.status } }));
    }
    throw new ApiError(res.status, path, `${detail} (${res.status})`);
  }
  return body as T;
}

export async function api<T>(path: string, options: RequestOptions = {}): Promise<T> {
  return send<T>(path, { method: "GET" }, options);
}

export async function apiPost<T>(path: string, body: unknown, options: RequestOptions = {}): Promise<T> {
  const result = await send<T>(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }, options);
  clearApiCache();
  return result;
}

export async function apiUpload<T>(path: string, body: FormData, options: RequestOptions = {}): Promise<T> {
  const result = await send<T>(path, { method: "POST", body }, options);
  clearApiCache();
  return result;
}

export type PipelineJob = { id: string; type: string; status: string; error?: string | null; stats?: Record<string, number | string>;
  progress?: Record<string, unknown>; cancel_requested?: boolean; created_at?: string; started_at?: string | null;
  heartbeat_at?: string | null; finished_at?: string | null };

const readCache = new Map<string, { data: unknown; until: number }>();
const inFlight = new Map<string, { controller: AbortController; promise: Promise<unknown>; consumers: number }>();
let generation = 0;

export function clearApiCache() { generation++; readCache.clear(); }
export function invalidateRead(path: string) { readCache.delete(path); }

// Browser-only, short-lived shared reads. Last consumer aborts transport. Never
// share authenticated responses across server requests or cache auth/error data.
export function readApi<T>(path: string, signal: AbortSignal, ttlMs = 20000): Promise<T> {
  if (signal.aborted) return Promise.reject(signal.reason);
  if (typeof window === "undefined") return api<T>(path, { signal });
  const cached = readCache.get(path);
  if (cached && cached.until > Date.now()) return Promise.resolve(cached.data as T);
  let entry = inFlight.get(path);
  if (!entry || entry.controller.signal.aborted) {
    const controller = new AbortController();
    const epoch = generation;
    const created = { controller, promise: Promise.resolve<unknown>(null), consumers: 0 };
    created.promise = api<T>(path, { signal: controller.signal }).then((data) => {
      if (!controller.signal.aborted && epoch === generation && ttlMs > 0 && !path.startsWith("/v1/auth") && !path.startsWith("/v1/admin")) {
        if (readCache.size >= 50) readCache.delete(readCache.keys().next().value!);
        readCache.set(path, { data, until: Date.now() + ttlMs });
      }
      return data;
    }).finally(() => { if (inFlight.get(path) === created) inFlight.delete(path); });
    entry = created;
    inFlight.set(path, entry);
  }
  const shared = entry;
  shared.consumers++;
  return new Promise<T>((resolve, reject) => {
    let done = false;
    const release = () => {
      if (done) return false;
      done = true; signal.removeEventListener("abort", abort);
      if (--shared.consumers === 0) shared.controller.abort();
      return true;
    };
    const abort = () => { if (release()) reject(signal.reason); };
    signal.addEventListener("abort", abort, { once: true });
    shared.promise.then((value) => { if (release()) resolve(value as T); }, (error) => { if (release()) reject(error); });
  });
}

export type IndexPoint = {
  series: string;
  frequency: string;
  period_date: string;
  origin?: string | null;
  destination?: string | null;
  value: number;
  imputed_share: number;
  coverage?: number;
  vintage?: string;
  n_quotes?: number;
  cpi_contribution_pp?: number;
};

export type HeatmapCell = {
  origin: string;
  destination: string;
  period_date: string;
  lead_time_days?: number | null;
  value: number;
};

export type ElasticityPoint = {
  origin?: string | null;
  destination?: string | null;
  lead_time_days: number;
  mean_total_fare: number;
};

export type RouteOut = {
  origin: string;
  destination: string;
  weight: number;
  raw_passengers: number;
  latest_index?: number | null;
  prev_index?: number | null;
  latest_fare?: number | null;
  contribution?: number | null;
  wow?: number | null;
  yoy?: number | null;
  coverage?: number | null;
  best_lead_bin?: number | null;
};

export type CollectionHealth = {
  source: string;
  last_started_at?: string | null;
  last_finished_at?: string | null;
  status: string;
  quotes_ok: number;
  quotes_missing: number;
  quotes_sold_out: number;
  quotes_blocked: number;
  notes: string;
  quotes_blocked_robots?: number;
  quotes_errors?: number;
};

export type CollectionSummary = {
  sources: CollectionHealth[];
  last_snapshot_at: string | null;
  snapshot_slot: string | null;
  coverage: number;
  cell_coverage: number;
  imputed_share: number;
  quality: string;
  vintage: string;
  target_met: boolean;
  cells: number;
  observed_cells: number;
  unavailable_cells: number;
  blocked_sources: string[];
  scrape_enabled: boolean;
  progress: Record<string, number>;
  job: { id: string; status: string; error?: string | null; progress?: Record<string, unknown>; events?: { id: number; created_at: string; level: string; event: string; source?: string | null; transport?: string | null; message: string; data?: Record<string, unknown> }[]; created_at?: string; started_at?: string | null; heartbeat_at?: string | null } | null;
  collection_settings?: { transport_mode: "tinyfish" | "http" | "offline"; max_sessions: number; max_agent_runs: number; max_hours: number };
  tinyfish_readiness?: string;
  tinyfish_enabled: boolean; tinyfish_disabled: boolean; budget_notes: string | null;
  sessions_opened: number; sessions_deleted: number; session_attempts: number;
  agent_runs: number; max_sessions: number; max_agent_runs: number;
  airlines: Record<string, { path?: string; phase?: string; current_cell?: string; last_status?: string; session_id?: string; session_deleted?: boolean; quotes_parsed?: number;
     blocked_reason?: string; error?: string; agent_id?: string }>;
};

export type AdapterHealth = {
  id: string; kind: string; host: string | null; source_rank: number; enabled: boolean; runnable: boolean;
  skipped_reason: string | null;
  robots: { verdict: string; notes: string; checked_at: string | null };
};

export type BacktestRow = {
  month: string;
  origin?: string | null;
  destination?: string | null;
  apix_monthly?: number | null;
  apix_mom_pct?: number | null;
  dgca_value?: number | null;
  dgca_mom_pct?: number | null;
  route_avg_fare?: number | null;
  dgca_route_avg?: number | null;
};

export type BacktestSummary = {
  correlation?: number | null;
  n_pairs: number;
  note: string;
  rows: BacktestRow[];
  mape?: number | null;
  rmse?: number | null;
  n?: number;
  pass?: boolean;
  provisional?: boolean;
};

export type QuoteOut = {
  source: string;
  origin: string;
  destination: string;
  carrier: string;
  flight_no: string;
  dep_date: string;
  fare_class: string;
  lead_time_days: number;
  collected_on: string;
  return_date?: string | null;
  trip_type?: string;
  base_fare: number;
  taxes: number;
  udf: number;
  convenience: number;
  total_fare: number;
  is_outlier: number;
  is_imputed: number;
};

export type CarrierFare = {
  carrier: string;
  flight_no: string;
  dep_date: string;
  fare_class: string;
  lead_time_days: number;
  base_fare: number;
  taxes: number;
  udf: number;
  convenience: number;
  total_fare: number;
  collected_on: string;
  return_date?: string | null;
  trip_type?: string;
};

export type SearchResult = {
  origin: string;
  destination: string;
  cheapest?: number | null;
  carriers: CarrierFare[];
  quote_count: number;
  fetched?: boolean;
  trip_type?: string;
};

export type TrendPoint = {
  period_date: string;
  avg_fare: number;
  min_fare: number;
  max_fare: number;
  quote_count: number;
};
