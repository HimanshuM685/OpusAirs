export type Cabin = "ECONOMY" | "PREMIUM_ECONOMY" | "BUSINESS";

export type ParsedLeg = {
  flight_no: string;
  fare_class: Cabin;
  total_fare: number;
};

const CABINS = new Set<Cabin>(["ECONOMY", "PREMIUM_ECONOMY", "BUSINESS"]);

function cabinOf(raw: string): Cabin | null {
  const t = raw.toUpperCase().replace(/[\s-]+/g, "_");
  if (t === "PREMIUM_ECONOMY" || t === "PREMIUMECONOMY") return "PREMIUM_ECONOMY";
  if (t === "ECONOMY" || t === "BUSINESS") return t;
  return null;
}

function fareOf(raw: string): number | null {
  const n = Number(raw.replace(/,/g, ""));
  if (!Number.isFinite(n) || n < 800 || n > 80000) return null;
  return n;
}

function flightOf(raw: string): string | null {
  const m = raw.toUpperCase().replace(/\s+/g, "").match(/^([A-Z0-9]{2})(\d{2,4})$/);
  if (!m) return null;
  return `${m[1]}${m[2]}`.slice(0, 16);
}

function attrs(tag: string): Record<string, string> {
  const out: Record<string, string> = {};
  const re = /data-([a-z0-9-]+)="([^"]*)"/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(tag))) out[m[1].toLowerCase()] = m[2];
  return out;
}

export function parseItineraries(html: string): ParsedLeg[] {
  const found: ParsedLeg[] = [];
  const seen = new Set<string>();
  const push = (flightRaw: string, cabinRaw: string, fareRaw: string) => {
    const flight_no = flightOf(flightRaw);
    const fare_class = cabinOf(cabinRaw);
    const total_fare = fareOf(fareRaw);
    if (!flight_no || !fare_class || total_fare == null) return;
    const key = `${flight_no}|${fare_class}|${total_fare}`;
    if (seen.has(key)) return;
    seen.add(key);
    found.push({ flight_no, fare_class, total_fare });
  };

  const tagRe = /<(?:article|div|li)\b[^>]*data-flight="[^"]+"[^>]*>/gi;
  let tag: RegExpExecArray | null;
  while ((tag = tagRe.exec(html))) {
    const a = attrs(tag[0]);
    if (a.flight && a.cabin && a.total) push(a.flight, a.cabin, a.total);
  }

  const textRe =
    /\b((?:6E|AI|IX|QP|SG|UK|G8|9I|S5))\s?-?\s?(\d{2,4})\b[^.\n]{0,48}?\b(PREMIUM[\s_]*ECONOMY|ECONOMY|BUSINESS)\b[^.\n]{0,48}?(?:₹|INR)\s*([0-9]{1,3}(?:,[0-9]{2,3})+|[0-9]{3,6})/gi;
  let m: RegExpExecArray | null;
  while ((m = textRe.exec(html))) push(`${m[1]}${m[2]}`, m[3], m[4]);
  return found;
}

export function validQuote(input: {
  origin?: string;
  destination?: string;
  dep_date?: string;
  total_fare?: number | null;
}): boolean {
  return Boolean(
    input.origin && /^[A-Z]{3}$/.test(input.origin) &&
      input.destination && /^[A-Z]{3}$/.test(input.destination) && input.origin !== input.destination &&
      input.dep_date &&
      /^\d{4}-\d{2}-\d{2}$/.test(input.dep_date) &&
      input.total_fare != null &&
      Number.isFinite(input.total_fare) && input.total_fare > 0,
  );
}

// Agent output is untrusted input. Reuse the same cabin/flight/fare rules as HTML extraction.
export function parseQuoteRows(data: unknown, cells: import("./types").CollectCell[], carrier: string): import("../ingest").QuoteIn[] {
  if (!Array.isArray(data)) return [];
  const accepted: import("../ingest").QuoteIn[] = [];
  for (const input of data) {
    if (!input || typeof input !== "object") continue;
    const r = input as Record<string, unknown>;
    if (typeof r.origin !== "string" || typeof r.destination !== "string" || typeof r.dep_date !== "string"
      || r.carrier !== carrier || r.fare_class !== "ECONOMY" || (r.trip_type != null && r.trip_type !== "one_way") || r.return_date) continue;
    const cell = cells.find((c) => c.origin === r.origin && c.destination === r.destination && c.depDate === r.dep_date);
    if (!cell) continue;
    const flight = typeof r.flight_no === "string" ? flightOf(r.flight_no) : null;
    if (r.status === "sold_out") {
      accepted.push({ origin: cell.origin, destination: cell.destination, dep_date: cell.depDate,
        carrier, flight_no: flight || "NA", fare_class: "ECONOMY", trip_type: "one_way", status: "sold_out", total_fare: null, parser_accepted: true });
      continue;
    }
    const fare = typeof r.total_fare === "number" ? fareOf(String(r.total_fare)) : null;
    if (r.status !== "ok" || !flight?.startsWith(carrier) || fare == null) continue;
    const quote = { origin: cell.origin, destination: cell.destination, dep_date: cell.depDate,
      carrier, flight_no: flight, fare_class: "ECONOMY", trip_type: "one_way", status: "ok", total_fare: fare, parser_accepted: true };
    if (validQuote(quote)) accepted.push(quote);
  }
  return accepted;
}
