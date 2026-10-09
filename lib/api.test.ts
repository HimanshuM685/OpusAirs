import assert from "node:assert/strict";
import { afterEach, it } from "node:test";
import { api, ApiError, apiPost, clearApiCache, readApi } from "./api";

afterEach(() => clearApiCache());
it("surfaces actionable API errors and does not treat errors as successful data", async (t) => {
  t.mock.method(globalThis, "fetch", async () => Response.json({ detail: "Choose two different airports" }, { status: 400 }));
  await assert.rejects(api("/v1/search"), (e: unknown) => e instanceof ApiError && e.status === 400 && e.message.includes("different airports"));
});
it("aborts requests on cancellation and bounds stalled fetches", async (t) => {
  t.mock.method(globalThis, "fetch", (_input: string | URL | Request, init?: RequestInit) => new Promise((_resolve, reject) => {
    init?.signal?.addEventListener("abort", () => reject(init.signal!.reason), { once: true });
  }));
  const controller = new AbortController();
  const pending = api("/v1/index", { signal: controller.signal });
  controller.abort();
  await assert.rejects(pending, { name: "AbortError" });
  const keepAlive = setTimeout(() => {}, 50);
  await assert.rejects(api("/v1/index", { timeoutMs: 5 }), /timed out/);
  clearTimeout(keepAlive);
});
it("shares browser reads, cancels one consumer without cancelling others, and reuses a bounded cache", async (t) => {
  Object.defineProperty(globalThis, "window", { value: {}, configurable: true });
  t.after(() => { Reflect.deleteProperty(globalThis, "window"); });
  let finish!: (r: Response) => void;
  let transport: AbortSignal | undefined;
  const fetch = t.mock.method(globalThis, "fetch", (_input: string | URL | Request, init?: RequestInit) => { transport = init?.signal || undefined; return new Promise<Response>((resolve) => { finish = resolve; }); });
  const first = new AbortController(), second = new AbortController();
  const a = readApi("/v1/routes", first.signal); const b = readApi("/v1/routes", second.signal);
  first.abort();
  await assert.rejects(a, { name: "AbortError" });
  assert.equal(transport?.aborted, false);
  finish(Response.json([{ origin: "DEL" }]));
  assert.deepEqual(await b, [{ origin: "DEL" }]);
  assert.deepEqual(await readApi("/v1/routes", new AbortController().signal), [{ origin: "DEL" }]);
  assert.equal(fetch.mock.callCount(), 1);
});
it("does not share server-side authenticated reads", async (t) => {
  const fetch = t.mock.method(globalThis, "fetch", async () => Response.json({ ok: true }));
  await Promise.all([readApi("/v1/routes", new AbortController().signal), readApi("/v1/routes", new AbortController().signal)]);
  assert.equal(fetch.mock.callCount(), 2);
});
it("does not retry mutations after an ambiguous failure", async (t) => {
  const fetch = t.mock.method(globalThis, "fetch", async () => { throw new Error("connection lost"); });
  await assert.rejects(apiPost("/v1/ingest/dump", { text: "fare" }), /connection lost/);
  assert.equal(fetch.mock.callCount(), 1);
});
