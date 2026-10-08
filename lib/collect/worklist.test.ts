import assert from "node:assert/strict";
import { it } from "node:test";
import { buildWorklist, needsRefresh } from "./jobs";
import { parseSchedule, type CatalogRoute } from "./catalog";
import { dueDiscovery, dueSnapshots } from "./scheduler";

const schedule: CatalogRoute[] = [{ origin: "CCU", destination: "MAA", carrier: "AI", flight_no: "AI101", dow_mask: 1, active: true }];
it("orders weighted basket first, T+21 first, then domestic catalog with departure DOW filter", () => {
  const cells = buildWorklist([{ origin: "DEL", destination: "BOM", weight: 0.3 }, { origin: "DEL", destination: "BLR", weight: 0.7 }], "2026-10-05", schedule, "AI");
  assert.deepEqual(cells.slice(0, 6).map((c) => [c.destination, c.leadTimeDays]), [21, 7, 1, 15, 30, 45].map((lead) => ["BLR", lead]));
  assert.equal(cells.filter((c) => c.inBasket).length, 12);
  assert.deepEqual(cells.filter((c) => !c.inBasket).map((c) => c.leadTimeDays), [21, 7]);
  assert.ok(cells.filter((c) => !c.inBasket).every((c) => new Date(c.depDate).getUTCDay() === 1));
  assert.equal(buildWorklist([], "2026-10-05", schedule, "QP").length, 0);
});
it("freshness matches travel date and expires at 36 hours", () => {
  const cell = buildWorklist([{ origin: "DEL", destination: "BOM" }], "2026-10-05")[0];
  const now = Date.parse("2026-10-05T00:30:00Z");
  const observation = { origin: "DEL", destination: "BOM", dep_date: cell.depDate, collected_at: "2026-10-04T00:30:00Z" };
  assert.equal(needsRefresh(cell, [observation], now), false);
  assert.equal(needsRefresh(cell, [{ ...observation, collected_at: "2026-10-03T12:30:00Z" }], now), true);
  assert.equal(needsRefresh(cell, [{ ...observation, dep_date: "2026-10-06" }], now), true);
});
it("schedule CSV validates domestic airports and weekday masks without any network discovery", () => {
  const rows = parseSchedule("origin,destination,carrier,flight_no,dow_mask\nDEL,BOM,AI,AI101,5", new Set(["DEL", "BOM"]));
  assert.equal(rows[0].dow_mask, 5);
  assert.throws(() => parseSchedule("origin,destination,carrier\nDEL,LHR,AI", new Set(["DEL", "BOM"])));
});
it("daily defaults to one slot and discovery is only due Sunday 02:00 IST", () => {
  assert.deepEqual(dueSnapshots(new Date("2026-10-08T12:30:00Z"), "6").map((s) => s.slot), ["0600"]);
  assert.equal(dueDiscovery(new Date("2026-10-10T20:29:00Z")), null);
  assert.equal(dueDiscovery(new Date("2026-10-10T20:30:00Z")), "2026-10-11");
  assert.equal(dueDiscovery(new Date("2026-10-12T02:00:00Z")), null);
});
