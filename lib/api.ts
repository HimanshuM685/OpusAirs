export async function api<T>(path: string): Promise<T> {
  const res = await fetch(path, { cache: "no-store", credentials: "include" });
  if (!res.ok) {
    throw new Error(`${res.status} ${res.statusText} for ${path}`);
  }
  return res.json() as Promise<T>;
}

export async function apiPost<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
    credentials: "include",
  });
  if (!res.ok) {
    throw new Error(`${res.status} ${res.statusText} for ${path}`);
  }
  return res.json() as Promise<T>;
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
  job: { id: string; status: string; error?: string | null } | null;
  tinyfish_enabled: boolean; tinyfish_disabled: boolean; budget_notes: string | null;
  sessions_opened: number; sessions_deleted: number; session_attempts: number;
  agent_runs: number; max_sessions: number; max_agent_runs: number;
  airlines: Record<string, { path?: string; session_id?: string; session_deleted?: boolean; quotes_parsed?: number;
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
