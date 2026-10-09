import assert from "node:assert/strict";
import { it, type TestContext } from "node:test";
import type { sql } from "../db";
import { collectionSources } from "./registry";

function fixtureQuery(blocked: string[] = []) {
  return (async (strings: TemplateStringsArray) => strings.join("").includes("scrape_sources")
    ? ["manual", "airindia", "airindia_express", "akasa", "spicejet", "indigo"].map((id) => ({ id, enabled: id !== "akasa" }))
    : blocked.map((source) => ({ source }))) as unknown as ReturnType<typeof sql>;
}

function scrape(t: TestContext, enabled: boolean) {
  const previous = process.env.SCRAPE_ENABLED;
  process.env.SCRAPE_ENABLED = String(enabled);
  t.after(() => { if (previous === undefined) delete process.env.SCRAPE_ENABLED; else process.env.SCRAPE_ENABLED = previous; });
}

it("source listing never performs outbound HTTP, even with live collection enabled", async (t) => {
  scrape(t, true);
  const network = t.mock.method(globalThis, "fetch", async () => { throw new Error("Source listing must not contact airline hosts"); });
  const result = await collectionSources(fixtureQuery());
  assert.equal(network.mock.callCount(), 0);
  const live = result.sources.find((source) => source.id === "airindia")!;
  assert.equal(live.runnable, true);
  assert.equal(live.robots.verdict, "pending");
  assert.equal(live.robots.checked_at, null);
  assert.equal(result.sources.find((source) => source.id === "manual")?.robots.verdict, "not_applicable");
});

it("source listing preserves policy exclusions, disabled adapters, and persisted slot blocks", async (t) => {
  scrape(t, true);
  const result = await collectionSources(fixtureQuery(["airindia"]));
  for (const [id, verdict] of [["indigo", "deny"], ["akasa", "disabled"], ["airindia", "blocked"]]) {
    const source = result.sources.find((entry) => entry.id === id)!;
    assert.equal(source.runnable, false, id);
    assert.equal(source.robots.verdict, verdict, id);
  }
});

it("closing the live environment gate keeps manual ingestion available", async (t) => {
  scrape(t, false);
  const result = await collectionSources(fixtureQuery());
  assert.equal(result.scrape_enabled, false);
  assert.equal(result.sources.find((source) => source.id === "airindia")?.robots.verdict, "disabled");
  assert.equal(result.sources.find((source) => source.id === "airindia")?.runnable, false);
  assert.equal(result.sources.find((source) => source.id === "manual")?.runnable, true);
});
