import type { QuoteIn } from "../ingest";
import type { HttpAttempt } from "./http";

export type CollectCell = {
  origin: string;
  destination: string;
  depDate: string;
  leadTimeDays: number;
  fareClass: "ECONOMY";
  tripType: "one_way";
};

export type RawQuote = QuoteIn;
export type CollectStatus = "ok" | "missing" | "sold_out" | "blocked" | "blocked_robots" | "error";
export type CollectResult = {
  source: string;
  sourceRank: number;
  status: CollectStatus;
  quotes: RawQuote[];
  notes?: string;
  attempts?: HttpAttempt[];
};

export interface SourceAdapter {
  id: string;
  sourceRank: number;
  kind: "manual" | "file" | "demo" | "html" | "api" | "skip";
  host?: string;
  searchPath?: string;
  skippedReason?: string;
  enabled(): boolean;
  allowedPath(path: string): Promise<boolean>;
  collect(cell: CollectCell): Promise<CollectResult>;
}

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
  snapshot_at: string;
  snapshot_slot: string;
};
