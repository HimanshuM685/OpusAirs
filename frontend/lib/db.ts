import { neon } from "@neondatabase/serverless";
import { join } from "node:path";

export function dataDir(): string {
  return process.env.DATA_DIR || join(process.cwd(), "..", "data");
}

function databaseUrl(): string {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL is required (Neon postgres URI)");
  }
  return url.replace(/&?channel_binding=require/, "").replace("?&", "?");
}

export function sql() {
  return neon(databaseUrl());
}

export function isoDate(value: unknown): string {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  const s = String(value ?? "");
  return s.slice(0, 10);
}

export function isoDateTime(value: unknown): string | null {
  if (value == null) return null;
  if (value instanceof Date) return value.toISOString();
  return String(value);
}
