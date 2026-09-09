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
  latest_fare?: number | null;
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
};

export type SearchResult = {
  origin: string;
  destination: string;
  cheapest?: number | null;
  carriers: CarrierFare[];
  quote_count: number;
  fetched?: boolean;
};

export type TrendPoint = {
  period_date: string;
  avg_fare: number;
  min_fare: number;
  max_fare: number;
  quote_count: number;
};
