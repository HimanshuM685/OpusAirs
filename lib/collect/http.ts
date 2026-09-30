export type FetchResult = {
  status: number;
  text: string;
  transient: boolean;
  error: string;
};

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export async function fetchText(url: string, ua: string): Promise<FetchResult> {
  let last: FetchResult = { status: 0, text: "", transient: true, error: "no attempt" };
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(url, {
        headers: { "User-Agent": ua, Accept: "text/html" },
        redirect: "follow",
        signal: AbortSignal.timeout(20000),
      });
      const text = await res.text();
      const transient = res.status >= 500;
      last = { status: res.status, text, transient, error: transient ? `HTTP ${res.status}` : "" };
      if (!transient) return last;
    } catch (err) {
      last = { status: 0, text: "", transient: true, error: String(err).slice(0, 200) };
    }
    if (attempt < 3) await sleep(400 * attempt);
  }
  return last;
}
