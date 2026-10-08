import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { chainStep, compileIndex, economyOneWay, jevons, type BasketW, type FarePoint } from "./index-math";

const basket: BasketW[] = [
  { origin: "DEL", destination: "BOM", weight: 0.6 },
  { origin: "DEL", destination: "BLR", weight: 0.4 },
];

function fare(origin: string, destination: string, day: string, lead: number, value: number): FarePoint {
  return { origin, destination, day, lead, fare: value };
}

describe("index math", () => {
  it("geometric mean is the elementary index", () => {
    const g = jevons([100, 400]);
    assert.ok(g != null && Math.abs(g - 200) < 1e-6);
  });

  it("Laspeyres is 100 on the base day", () => {
    const points = [
      ...[1, 7, 15, 21, 30, 45].map((lead) => fare("DEL", "BOM", "2026-08-01", lead, 5000)),
      ...[1, 7, 15, 21, 30, 45].map((lead) => fare("DEL", "BLR", "2026-08-01", lead, 4000)),
    ];
    const rows = compileIndex(points, basket, "2026-08-01");
    const lasp = rows.find((r) => r.series === "apix_laspeyres" && r.period === "2026-08-01");
    assert.equal(lasp?.value, 100);
  });

  it("a missing cell is imputed and the index stays defined", () => {
    const points: FarePoint[] = [];
    for (const day of ["2026-08-01", "2026-08-02"]) {
      for (const lead of [1, 7, 15, 21, 30, 45]) {
        points.push(fare("DEL", "BOM", day, lead, 5000));
        if (!(day === "2026-08-02" && lead === 21)) points.push(fare("DEL", "BLR", day, lead, 4000));
      }
    }
    const rows = compileIndex(points, basket, "2026-08-01");
    const day2 = rows.find((r) => r.series === "apix_laspeyres" && r.period === "2026-08-02");
    assert.ok(day2);
    assert.ok(day2.imputed_share > 0);
    assert.ok(Number.isFinite(day2.value));
    assert.deepEqual(compileIndex(points, basket, "2026-08-01"), rows);
  });

  it("BUSINESS quotes are excluded before Laspeyres", () => {
    const economy = [fare("DEL", "BOM", "2026-08-01", 1, 5000)];
    const withBusiness = economyOneWay([
      { fare_class: "ECONOMY", trip_type: "one_way", ...economy[0] },
      { fare_class: "BUSINESS", trip_type: "one_way", origin: "DEL", destination: "BOM", day: "2026-08-01", lead: 1, fare: 20000 },
    ]);
    assert.equal(withBusiness.length, 1);
    assert.equal(withBusiness[0].fare, 5000);
  });

  it("chain link multiplies the previous index by the price relative", () => {
    const now = new Map([["DEL|BOM", 110]]);
    const prev = new Map([["DEL|BOM", 100]]);
    const next = chainStep(100, [{ origin: "DEL", destination: "BOM", weight: 1 }], now, prev);
    assert.ok(Math.abs(next - 110) < 1e-9);
  });
  it("catalog-only route fares cannot change national index or basket imputation", () => {
    const points = [1, 7, 15, 21, 30, 45].map((lead) => fare("DEL", "BOM", "2026-10-08", lead, 5000));
    const before = compileIndex(points, basket, "2026-10-08");
    const withCatalog = [...points, ...[1, 7, 15, 21, 30, 45].map((lead) => fare("CCU", "MAA", "2026-10-08", lead, 50000))];
    assert.deepEqual(compileIndex(withCatalog, basket, "2026-10-08"), before);
  });
});
