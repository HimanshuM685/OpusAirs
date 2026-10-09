import { CHALLENGE, PoliteHttp, sharedHttp, botUserAgent, skippedHost, type HttpAttempt } from "./http";
import { liveCollectionEnabled } from "./runtime";

export type RobotsVerdict = { verdict: "allow" | "deny" | "fetch_error" | "disabled"; notes: string; checked_at: string | null };
const cache = new Map<string, { expires: number; value: Promise<string | null> }>();

export function resetRobotsCache(): void {
  cache.clear();
}

export function robotsAllows(text: string, pathname: string, ua: string): boolean {
  const normalize = (path: string) => path.replace(/%[\da-f]{2}/gi, (hex) => {
    const char = String.fromCharCode(parseInt(hex.slice(1), 16));
    return /[a-z\d_.~-]/i.test(char) ? char : hex.toUpperCase();
  });
  pathname = normalize(pathname);
  const parsed: { agents: string[]; rules: { allow: boolean; path: string }[] }[] = [];
  let group = { agents: [] as string[], rules: [] as { allow: boolean; path: string }[] };
  let directives = false;
  for (const line of text.split(/\r?\n/).map((l) => l.replace(/#.*$/, "").trim()).filter(Boolean)) {
      const idx = line.indexOf(":");
      if (idx < 1) continue;
      const key = line.slice(0, idx).trim().toLowerCase();
      const value = line.slice(idx + 1).trim();
      if (key === "user-agent") {
        if (directives) { parsed.push(group); group = { agents: [], rules: [] }; directives = false; }
        group.agents.push(value.toLowerCase());
      } else if (group.agents.length) {
        directives = true;
        if (key === "allow" || key === "disallow") group.rules.push({ allow: key === "allow", path: value });
      }
  }
  if (group.agents.length) parsed.push(group);
  const needle = ua.toLowerCase();
  const specificity = (g: typeof group) => Math.max(0, ...g.agents.filter((a) => a !== "*" && needle.includes(a)).map((a) => a.length));
  const longest = Math.max(0, ...parsed.map(specificity));
  const specific = parsed.filter((g) => longest > 0 && specificity(g) === longest);
  const star = parsed.filter((g) => g.agents.includes("*"));
  const rules = (specific.length ? specific : star).flatMap((g) => g.rules);
  let winner: { allow: boolean; len: number } | null = null;
  for (const rule of rules) {
    if (!rule.path) continue;
    const pattern = normalize(rule.path).replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*").replace(/\\\$$/, "$");
    if (!new RegExp(`^${pattern}`).test(pathname)) continue;
    const len = rule.path.replace(/[*$]/g, "").length;
    if (!winner || len > winner.len || (len === winner.len && rule.allow)) winner = { allow: rule.allow, len };
  }
  return winner ? winner.allow : true;
}

export async function robotsVerdict(url: string, http: PoliteHttp = sharedHttp(), record?: (attempt: HttpAttempt) => void): Promise<RobotsVerdict> {
  if (!liveCollectionEnabled()) return { verdict: "disabled", notes: "Live transport disabled for this run", checked_at: null };
  const parsed = new URL(url);
  if (skippedHost(parsed.hostname)) return { verdict: "deny", notes: "search host skipped by collection policy", checked_at: null };
  const origin = parsed.origin;
  let entry = cache.get(origin);
  if (!entry || entry.expires <= Date.now()) {
    entry = { expires: Date.now() + 5 * 60 * 1000, value: http.request(`${origin}/robots.txt`, record).then((res) => res.status >= 200 && res.status < 300 && !/<html|<!doctype/i.test(res.text)
      && (!CHALLENGE.test(res.text) || /^\s*user-agent\s*:/im.test(res.text)) ? res.text : null) };
    cache.set(origin, entry);
  }
  const text = await entry.value;
  const checked_at = new Date().toISOString();
  if (text == null) return { verdict: "fetch_error", notes: "robots_fetch_error (fail closed)", checked_at };
  const delays = [...text.matchAll(/^\s*crawl-delay\s*:\s*(\d+(?:\.\d+)?)/gim)].map((m) => Number(m[1]) * 1000);
  // Conservatively respect the slowest published crawl delay, including a stricter group.
  if (delays.length) http.setHostDelay(parsed.host, Math.max(...delays));
  const allowed = robotsAllows(text, `${parsed.pathname}${parsed.search}`, botUserAgent());
  return { verdict: allowed ? "allow" : "deny", notes: allowed ? "robots_allow" : "robots_disallow", checked_at };
}

export async function originAllowed(url: string): Promise<boolean> {
  return (await robotsVerdict(url)).verdict === "allow";
}
