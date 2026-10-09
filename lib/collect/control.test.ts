import assert from "node:assert/strict";
import { it } from "node:test";
import { validateSettings } from "./control";
import { istInputValue, parseIstInput } from "./contracts";
import { collectionRuntime, withCollectionSettings } from "./runtime";
import { safeLogMessage } from "./reporter";

const settings = { transport_mode: "tinyfish" as const, max_sessions: 5, max_agent_runs: 5, max_hours: 3 };
it("validates persisted paid-work caps and requires an explicit supported mode", () => {
  assert.deepEqual(validateSettings(settings), settings);
  for (const patch of [{ transport_mode: "auto" }, { max_sessions: 0 }, { max_sessions: 6 }, { max_agent_runs: 1.5 }, { max_hours: Infinity }, { max_hours: 4 }])
    assert.throws(() => validateSettings({ ...settings, ...patch }));
  assert.equal(validateSettings({ ...settings, transport_mode: "offline", max_sessions: 0 }).max_sessions, 0);
});
it("converts IST schedules independently of laptop timezone and rejects impossible dates", () => {
  assert.equal(parseIstInput("2026-10-10T00:15"), "2026-10-09T18:45:00.000Z");
  assert.equal(istInputValue(new Date("2026-10-09T18:45:00Z")), "2026-10-10T00:15");
  for (const value of ["2026-02-30T12:00", "2026-10-10T24:00", "", "2026-10-10T12:00Z"]) assert.throws(() => parseIstInput(value));
});
it("isolates simultaneous runtime settings without changing process environment", async () => {
  const modes = await Promise.all(["offline", "http"].map((transport_mode) => withCollectionSettings(
    { ...settings, transport_mode: transport_mode as "offline" | "http" }, async () => {
      await new Promise(setImmediate); return collectionRuntime()?.transport_mode;
    })));
  assert.deepEqual(modes, ["offline", "http"]); assert.equal(collectionRuntime(), undefined);
});
it("redacts credentials and CDP/database addresses from worker logs", () => {
  const text = safeLogMessage("failed postgresql://name:secret@db.example/air wss://cdp.example/secret?token=abc api_key=secret-value");
  assert.doesNotMatch(text, /name:secret|cdp\.example|secret-value/);
});
