import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { PoliteHttp } from "./http";

describe("polite HTTP transport", () => {
  it("serializes same-host requests and enforces jitter and RPM between starts", async () => {
    let now = 0;
    const starts: number[] = [];
    const client = new PoliteHttp({ enabled: () => true, now: () => now, random: () => 0,
      sleep: async (ms) => { now += ms; }, minJitter: 3000, maxJitter: 8000, rpm: 8,
      fetch: async () => { starts.push(now); return new Response("OK"); } });
    await Promise.all([client.request("https://allowed.example/robots.txt"), client.request("https://allowed.example/search"), client.request("https://allowed.example/search?page=2")]);
    assert.equal(starts.length, 3);
    assert.ok(starts[1] - starts[0] >= 7500);
    assert.ok(starts[2] - starts[1] >= 7500);
  });

  it("retries 429/503 twice with exponential backoff and records each attempt", async () => {
    let now = 0; let calls = 0;
    const sleeps: number[] = [];
    const attempts: number[] = [];
    const client = new PoliteHttp({ enabled: () => true, now: () => now, random: () => 0,
      sleep: async (ms) => { sleeps.push(ms); now += ms; }, minJitter: 0, maxJitter: 0, rpm: 100000,
      fetch: async () => new Response("busy", { status: ++calls === 1 ? 429 : 503 }) });
    const result = await client.request("https://allowed.example/search", (a) => attempts.push(a.status));
    assert.deepEqual(attempts, [429, 503, 503]);
    assert.ok(sleeps.includes(3000) && sleeps.includes(6000));
    assert.equal(result.transient, true);
    assert.equal(calls, 3);
  });

  it("does not retry a challenge or follow a redirect", async () => {
    let calls = 0;
    const client = new PoliteHttp({ enabled: () => true, fetch: async (_url, opts) => {
      calls++; assert.equal(opts?.redirect, "manual");
      return new Response("Verify you are human", { status: 503 });
    } });
    await client.request("https://allowed.example/search");
    assert.equal(calls, 1);
  });

  it("never fetches policy-excluded hosts, even with live HTTP enabled", async () => {
    const client = new PoliteHttp({ enabled: () => true, fetch: async () => { assert.fail("excluded host fetched"); } });
    const result = await client.request("https://www.goindigo.in/book/flight-select.html");
    assert.equal(result.error, "source_skipped");
  });

  it("bounds concurrent hosts", async () => {
    let active = 0; let peak = 0;
    const client = new PoliteHttp({ enabled: () => true, maxHosts: 2, fetch: async () => {
      active++; peak = Math.max(peak, active);
      await new Promise((r) => setTimeout(r, 5)); active--;
      return new Response("OK");
    } });
    await Promise.all(["a", "b", "c", "d"].map((h) => client.request(`https://${h}.example/search`)));
    assert.equal(peak, 2);
  });
});
