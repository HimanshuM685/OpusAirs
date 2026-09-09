import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parseCsvQuotes, type QuoteIn } from "./ingest";

function quotesFromJson(value: unknown): QuoteIn[] {
  if (Array.isArray(value)) return value as QuoteIn[];
  if (value && typeof value === "object" && Array.isArray((value as { quotes?: unknown }).quotes)) {
    return (value as { quotes: QuoteIn[] }).quotes;
  }
  throw new Error("JSON must be a quotes array or { quotes: [...] }");
}

function loadDotEnv(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const file of [".env", ".env.local"]) {
    const p = join(process.cwd(), file);
    if (!existsSync(p)) continue;
    for (const line of readFileSync(p, "utf8").split(/\r?\n/)) {
      const t = line.trim();
      if (!t || t.startsWith("#")) continue;
      const i = t.indexOf("=");
      if (i < 1) continue;
      let v = t.slice(i + 1).trim();
      if (
        (v.startsWith('"') && v.endsWith('"')) ||
        (v.startsWith("'") && v.endsWith("'"))
      ) {
        v = v.slice(1, -1);
      }
      out[t.slice(0, i).trim()] = v;
    }
  }
  return out;
}

function env(name: string): string {
  const fromProc = process.env[name];
  if (fromProc && fromProc.trim()) return fromProc.trim();
  return (loadDotEnv()[name] || "").trim();
}

type LlmCfg = { key: string; base: string; model: string; headers: Record<string, string> };

function llmConfig(): LlmCfg | null {
  const groq = env("GROQ_API_KEY");
  const openrouter = env("OPENROUTER_API_KEY");
  const groqModel = env("GROQ_MODEL") || env("LLM_MODEL");
  const groqLooksOpenRouter = groqModel.includes("/");

  if (openrouter && (groqLooksOpenRouter || !groq)) {
    return {
      key: openrouter,
      base: (env("OPENROUTER_BASE_URL") || "https://openrouter.ai/api/v1").replace(/\/$/, ""),
      model: env("OPENROUTER_MODEL") || env("LLM_MODEL") || "openai/gpt-4o-mini",
      headers: { "HTTP-Referer": "https://opusairs.local", "X-Title": "OpusAirs" },
    };
  }
  if (groq) {
    return {
      key: groq,
      base: (env("GROQ_BASE_URL") || "https://api.groq.com/openai/v1").replace(/\/$/, ""),
      model: groqLooksOpenRouter ? "llama-3.3-70b-versatile" : groqModel || "llama-3.3-70b-versatile",
      headers: {},
    };
  }
  if (openrouter) {
    return {
      key: openrouter,
      base: (env("OPENROUTER_BASE_URL") || "https://openrouter.ai/api/v1").replace(/\/$/, ""),
      model: env("OPENROUTER_MODEL") || env("LLM_MODEL") || "openai/gpt-4o-mini",
      headers: { "HTTP-Referer": "https://opusairs.local", "X-Title": "OpusAirs" },
    };
  }
  return null;
}

async function chatJson(cfg: LlmCfg, text: string, jsonMode: boolean): Promise<Response> {
  return fetch(`${cfg.base}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${cfg.key}`,
      "Content-Type": "application/json",
      ...cfg.headers,
    },
    body: JSON.stringify({
      model: cfg.model,
      temperature: 0,
      ...(jsonMode ? { response_format: { type: "json_object" } } : {}),
      messages: [
        {
          role: "system",
          content:
            'Extract Indian domestic airfare quotes. Return JSON {"quotes":[...]}. Each quote: origin, destination (IATA), carrier, flight_no, dep_date (YYYY-MM-DD), optional return_date, trip_type (one_way|round_trip), lead_time_days, collected_on, total_fare (INR number), optional base_fare taxes udf convenience status source. Skip rows missing origin, destination, dep_date, and a fare.',
        },
        { role: "user", content: text.slice(0, 12000) },
      ],
    }),
  });
}

async function parseWithLlm(text: string): Promise<QuoteIn[]> {
  const cfg = llmConfig();
  if (!cfg) {
    throw new Error(
      "Natural language dump needs GROQ_API_KEY or OPENROUTER_API_KEY, or paste JSON/CSV.",
    );
  }
  let res = await chatJson(cfg, text, true);
  if (!res.ok) res = await chatJson(cfg, text, false);
  if (!res.ok) {
    const hint = await res.text().then((t) => t.slice(0, 240)).catch(() => "");
    throw new Error(`LLM parse failed (${res.status})${hint ? `: ${hint}` : ""}`);
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
