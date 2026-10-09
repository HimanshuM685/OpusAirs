import type { sql as sqlFn } from "../db";
import { recordJobEvent, updateJobProgress, type CollectionEvent } from "./control";
import type { JobProgress } from "./contracts";

export function safeLogMessage(value: unknown): string {
  let text = String(value).replace(/(?:postgres(?:ql)?:\/\/|wss?:\/\/)[^\s]+/gi, "[private connection]")
    .replace(/(api[-_ ]?key|authorization|cookie|token|secret)\s*[:=]\s*[^\s,;]+/gi, "$1=[redacted]");
  for (const key of ["DATABASE_URL", "TINYFISH_API_KEY", "NEON_AUTH_COOKIE_SECRET", "INGEST_API_KEY"]) {
    const secret = process.env[key]; if (secret) text = text.split(secret).join("[redacted]");
  }
  return text.slice(0, 1000);
}

export class CollectionReporter {
  progress: JobProgress = {};
  private lastFlush = 0;
  constructor(private q: ReturnType<typeof sqlFn>, readonly id: string, private output?: (event: CollectionEvent) => void) {}
  async event(entry: CollectionEvent, patch: JobProgress = {}) {
    const safe = { ...entry, message: safeLogMessage(entry.message) };
    this.progress = { ...this.progress, ...patch, last_message: safe.message };
    this.output?.(safe);
    await recordJobEvent(this.q, this.id, safe);
    await this.flush(true);
  }
  async cell(patch: JobProgress, status: string, quoteCount: number) {
    this.progress = { ...this.progress, ...patch };
    const entry = { event: "cell_finished", source: patch.source, transport: patch.transport,
      message: `${patch.current_cell}: ${status}; ${quoteCount} quotes`,
      data: { completed: patch.completed, total: patch.total, quotes: quoteCount, status } };
    this.output?.(entry);
    // The cell ledger already records every outcome. Persist a bounded progress
    // sample rather than adding three Neon round trips for each empty cell.
    if (Date.now() - this.lastFlush >= 2000 || patch.completed === patch.total) {
      await recordJobEvent(this.q, this.id, entry);
      await this.flush(true);
    }
  }
  async flush(force = false) {
    if (!force && Date.now() - this.lastFlush < 2000) return;
    await updateJobProgress(this.q, this.id, this.progress); this.lastFlush = Date.now();
  }
}
