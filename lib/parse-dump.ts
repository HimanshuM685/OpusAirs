import { parseCsvQuotes, type QuoteIn } from "./ingest";

function quotesFromJson(value: unknown): QuoteIn[] {
  if (Array.isArray(value)) return value as QuoteIn[];
  if (value && typeof value === "object" && Array.isArray((value as { quotes?: unknown }).quotes)) {
    return (value as { quotes: QuoteIn[] }).quotes;
  }
  throw new Error("JSON must be a quotes array or { quotes: [...] }");
}

async function parseWithLlm(text: string): Promise<QuoteIn[]> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) {
    throw new Error(
      "Natural language dump needs OPENAI_API_KEY, or paste JSON/CSV. See the needed list for fields.",
    );
  }
  const base = (process.env.OPENAI_BASE_URL || "https://api.openai.com/v1").replace(/\/$/, "");
  const model = process.env.OPENAI_MODEL || "gpt-4o-mini";
  const res = await fetch(`${base}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "Extract Indian domestic airfare quotes. Return JSON {\"quotes\":[...]}. Each quote: origin, destination (IATA), carrier, flight_no, dep_date (YYYY-MM-DD), optional return_date, trip_type (one_way|round_trip), lead_time_days, collected_on, total_fare (INR number), optional base_fare taxes udf convenience status source. Skip rows missing origin, destination, dep_date, and a fare.",
        },
        { role: "user", content: text.slice(0, 12000) },
      ],
    }),
  });
  if (!res.ok) {
    throw new Error(`LLM parse failed (${res.status})`);
  }
  const body = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  const content = body.choices?.[0]?.message?.content || "{}";
  const match = content.match(/\{[\s\S]*\}/);
  return quotesFromJson(JSON.parse(match ? match[0] : content));
}

export async function parseDump(text: string): Promise<QuoteIn[]> {
  const t = text.replace(/^\uFEFF/, "").trim();
  if (!t) return [];
  if (t.startsWith("{") || t.startsWith("[")) {
    return quotesFromJson(JSON.parse(t));
  }
  const first = t.split(/\r?\n/, 1)[0] || "";
  if (first.includes(",") && /origin|from/i.test(first)) {
    return parseCsvQuotes(t);
  }
  return parseWithLlm(t);
}
