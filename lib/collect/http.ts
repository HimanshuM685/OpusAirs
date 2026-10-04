export type HttpAttempt = { host: string; status: number; error: string; at: string };
export type FetchResult = { status: number; text: string; transient: boolean; error: string };
export const CHALLENGE = /captcha|recaptcha|hcaptcha|cf-challenge|cf-turnstile|challenge-platform|verify you are human|access denied|unusual traffic|just a moment/i;
export const SKIPPED_HOSTS = ["goindigo.in", "makemytrip.com", "ixigo.com", "goibibo.com", "yatra.com"];

export function skippedHost(host: string): boolean {
  return SKIPPED_HOSTS.some((h) => host === h || host.endsWith(`.${h}`));
}

export function botUserAgent(): string {
  const domain = process.env.BOT_DOMAIN || "example.invalid";
  const contact = process.env.BOT_CONTACT || "contact@example.invalid";
  return `OpusAirs-APIx-Bot/1.0 (+https://${domain}/bot; ${contact})`;
}

type Options = {
  fetch?: typeof fetch;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
  random?: () => number;
  enabled?: () => boolean;
  minJitter?: number;
  maxJitter?: number;
  rpm?: number;
  maxHosts?: number;
};

// Shared by every adapter in a run: one serialized queue per host, bounded host concurrency.
export class PoliteHttp {
  private tails = new Map<string, Promise<void>>();
  private last = new Map<string, number>();
  private delays = new Map<string, number>();
  private active = 0;
  private waiters: (() => void)[] = [];
  private readonly opts: Required<Options>;

  constructor(options: Options = {}) {
    const [min, max] = (process.env.COLLECT_JITTER_MS || "3000-8000").split("-").map(Number);
    this.opts = {
      fetch: options.fetch ?? fetch,
      now: options.now ?? Date.now,
      sleep: options.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms))),
      random: options.random ?? Math.random,
      enabled: options.enabled ?? (() => process.env.SCRAPE_ENABLED === "true"),
      minJitter: options.minJitter ?? Math.max(3000, min || 3000),
      maxJitter: options.maxJitter ?? Math.max(3000, min || 3000, max || 8000),
      rpm: options.rpm ?? Math.max(1, Math.min(8, Number(process.env.COLLECT_MAX_RPM_PER_HOST) || 8)),
      maxHosts: options.maxHosts ?? Math.max(1, Math.min(10, Number(process.env.COLLECT_MAX_CONCURRENT_HOSTS) || 3)),
    };
  }

  private async permit(): Promise<() => void> {
    if (this.active >= this.opts.maxHosts) await new Promise<void>((resolve) => this.waiters.push(resolve));
    else this.active++;
    return () => {
      const next = this.waiters.shift();
      if (next) next();
      else this.active--;
    };
  }

  setHostDelay(host: string, ms: number): void { this.delays.set(host, Math.max(this.delays.get(host) || 0, ms)); }

  async request(url: string, record?: (attempt: HttpAttempt) => void): Promise<FetchResult> {
    const parsed = new URL(url);
    const host = parsed.host;
    if (!this.opts.enabled()) return { status: 0, text: "", transient: false, error: "scrape_disabled" };
    if (parsed.protocol !== "https:" || parsed.username || parsed.password || skippedHost(parsed.hostname)) {
      return { status: 0, text: "", transient: false, error: "source_skipped" };
    }
    const previous = this.tails.get(host) ?? Promise.resolve();
    let release!: () => void;
    const tail = new Promise<void>((r) => { release = r; });
    this.tails.set(host, tail);
    await previous;
    try {
      let result: FetchResult = { status: 0, text: "", transient: true, error: "timeout" };
      for (let attempt = 0; attempt < 3; attempt++) {
        if (!this.opts.enabled()) return { status: 0, text: "", transient: false, error: "scrape_disabled" };
        const jitter = this.opts.minJitter + this.opts.random() * (this.opts.maxJitter - this.opts.minJitter);
        const gap = Math.max(jitter, 60000 / this.opts.rpm, this.delays.get(host) || 0);
        const last = this.last.get(host);
        if (last != null) await this.opts.sleep(Math.max(0, last + gap - this.opts.now()));
        const free = await this.permit();
        if (!this.opts.enabled()) { free(); return { status: 0, text: "", transient: false, error: "scrape_disabled" }; }
        this.last.set(host, this.opts.now());
        let retryAfter = 0;
        try {
          // Redirects are never followed blindly into an unaudited search path/host.
          const res = await this.opts.fetch(url, {
            headers: { "User-Agent": botUserAgent(), Accept: "text/html,application/json,text/plain" },
            redirect: "manual",
            signal: AbortSignal.timeout(20000),
          });
          const text = await res.text();
          const transient = res.status === 429 || res.status >= 500;
          result = { status: res.status, text, transient, error: res.ok ? "" : `http_${res.status}` };
          const header = res.headers.get("retry-after");
          if (header) retryAfter = /^\d+$/.test(header) ? Number(header) * 1000 : Math.max(0, Date.parse(header) - this.opts.now());
        } catch (err) {
          result = { status: 0, text: "", transient: true, error: err instanceof Error && /timeout|abort/i.test(err.name) ? "timeout" : "network_error" };
        } finally {
          free();
        }
        record?.({ host, status: result.status, error: result.error, at: new Date(this.opts.now()).toISOString() });
        if (!result.transient || CHALLENGE.test(result.text)) return result;
        if (attempt < 2) await this.opts.sleep(Math.max(3000 * 2 ** attempt, retryAfter));
      }
      return result;
    } finally {
      release();
      if (this.tails.get(host) === tail) this.tails.delete(host);
    }
  }
}

let shared: PoliteHttp | undefined;
export function sharedHttp(): PoliteHttp { return shared ??= new PoliteHttp(); }
