const cache = new Map<string, string | null>();

export function resetRobotsCache(): void {
  cache.clear();
}

export function robotsAllows(text: string, pathname: string, ua: string): boolean {
  const groups = text.split(/\n(?=User-agent:)/i).map((g) => g.trim()).filter(Boolean);
  const parsed = groups.map((group) => {
    const lines = group.split(/\r?\n/).map((l) => l.replace(/#.*$/, "").trim()).filter(Boolean);
    const agents: string[] = [];
    const rules: { allow: boolean; path: string }[] = [];
    for (const line of lines) {
      const idx = line.indexOf(":");
      if (idx < 1) continue;
      const key = line.slice(0, idx).trim().toLowerCase();
      const value = line.slice(idx + 1).trim();
      if (key === "user-agent") agents.push(value.toLowerCase());
      else if (key === "allow") rules.push({ allow: true, path: value });
      else if (key === "disallow") rules.push({ allow: false, path: value });
    }
    return { agents, rules };
  });
  const needle = ua.toLowerCase();
  const specific = parsed.filter((g) => g.agents.some((a) => a !== "*" && needle.includes(a)));
  const star = parsed.filter((g) => g.agents.includes("*"));
  const rules = (specific.length ? specific : star).flatMap((g) => g.rules);
  let winner: { allow: boolean; len: number } | null = null;
  for (const rule of rules) {
    if (!rule.path) continue;
    if (!pathname.startsWith(rule.path)) continue;
    if (!winner || rule.path.length > winner.len) winner = { allow: rule.allow, len: rule.path.length };
  }
  return winner ? winner.allow : true;
}

export async function originAllowed(url: string, ua: string): Promise<boolean> {
  const origin = new URL(url).origin;
  if (!cache.has(origin)) {
    try {
      const res = await fetch(`${origin}/robots.txt`, {
        headers: { "User-Agent": ua },
        signal: AbortSignal.timeout(15000),
        redirect: "follow",
      });
      cache.set(origin, res.ok ? await res.text() : null);
    } catch {
      cache.set(origin, null);
    }
  }
  const text = cache.get(origin);
  if (!text) return false;
  return robotsAllows(text, new URL(url).pathname, ua);
}
