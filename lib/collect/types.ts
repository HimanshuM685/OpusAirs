import type { QuoteIn } from "../ingest";

export type CollectJob = {
  id: number;
  collected_on: string;
  source: string;
  origin: string;
  destination: string;
  dep_date: string;
  return_date: string | null;
  trip_type: "one_way" | "round_trip";
  attempts: number;
};

export type CollectOutcome = {
  status: "ok" | "missing" | "blocked";
  reason: string;
  host: string;
  http: number | null;
  quotes: QuoteIn[];
  transient?: boolean;
};

export type SourceCollector = {
  id: string;
  carrier: string;
  collect: (job: CollectJob) => Promise<CollectOutcome>;
};
