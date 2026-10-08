import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { coverageForCells, pickSnapshotCells, type SnapshotQuote } from "../snapshot";
import { compileIndex, LEAD_BINS } from "../index-math";

const basket = [{ origin: "DEL", destination: "BOM", weight: 0.7 }, { origin: "DEL", destination: "BLR", weight: 0.3 }];
const day = "2026-10-05";
const at = `${day}T00:30:00.000Z`;
const quote = (extra: Partial<SnapshotQuote> = {}): SnapshotQuote => ({ id: 1, origin: "DEL", destination: "BOM", lead_time_days: 1,
  carrier: "6E", source: "manual", source_rank: 40, total_fare: 5000, collected_on: day, fare_class: "ECONOMY", trip_type: "one_way", ...extra });

describe("snapshot coverage and provenance", () => {
  it("ignores BUSINESS and round-trip fares and picks the lowest source rank", () => {
    const cells = pickSnapshotCells(basket, [quote(), quote({ source: "airindia", source_rank: 12, total_fare: 5500 }),
      quote({ fare_class: "BUSINESS", source_rank: 1, total_fare: 1000 }), quote({ trip_type: "round_trip", source_rank: 1, total_fare: 1500 })], day, at);
    assert.equal(cells[0].source, "airindia"); assert.equal(cells[0].total_fare, 5500);
    assert.equal(cells.length, 12);
  });

  it("fills every missing cell, flags imputation, and preserves index quality", () => {
    const quotes = LEAD_BINS.map((lead) => quote({ lead_time_days: lead }));
    const cells = pickSnapshotCells(basket, quotes, day, at);
    const coverage = coverageForCells(basket, cells);
    assert.ok(Math.abs(coverage.coverage - 0.7) < 1e-9);
    assert.ok(cells.filter((c) => c.destination === "BLR").every((c) => c.is_imputed === 1 && c.impute_method === "route_median"));
    const points = cells.map((c) => ({ origin: c.origin, destination: c.destination, day, lead: c.lead_time_bin, fare: c.total_fare!, imputed: Boolean(c.is_imputed) }));
    const rows = compileIndex(points, basket, day);
    const national = rows.find((r) => r.series === "apix_laspeyres" && r.frequency === "daily")!;
    assert.ok(Math.abs(national.coverage - 0.7) < 1e-9);
    assert.ok(national.imputed_share > 0);
    assert.equal(national.quality, "partial");
  });

  it("keeps entirely unobserved slots complete but unpriced and low quality", () => {
    const cells = pickSnapshotCells(basket, [], day, at);
    assert.equal(cells.length, 12);
    assert.ok(cells.every((c) => c.total_fare == null && c.is_imputed === 1 && c.impute_method === "unavailable"));
    assert.equal(coverageForCells(basket, cells).vintage, "provisional");
    assert.equal(coverageForCells(basket, cells).quality, "low");
  });

  it("does not reuse the morning source quote as an observed evening quote", () => {
    const evening = `${day}T12:30:00.000Z`;
    const cells = pickSnapshotCells(basket, [quote({ snapshot_at: at })], day, evening);
    assert.equal(cells[0].is_imputed, 1);
    assert.equal(cells[0].total_fare, null);
  });

  it("morning operator observations can carry forward but never become evening observations", () => {
    const quotes = LEAD_BINS.map((lead) => quote({ lead_time_days: lead, collected_at: "2026-10-05T00:40:00Z" }));
    const morning = pickSnapshotCells(basket, quotes, day, at, false, [], "0600");
    assert.ok(Math.abs(coverageForCells(basket, morning).coverage - 0.7) < 1e-9);
    const previous = morning.map((c) => ({ ...c, collected_on: day, snapshot_at: at }));
    const evening = pickSnapshotCells(basket, quotes, day, `${day}T12:30:00.000Z`, false, previous, "1800");
    assert.equal(coverageForCells(basket, evening).coverage, 0);
    assert.ok(evening.filter((c) => c.destination === "BOM").every((c) => c.impute_method === "carry_forward" && c.total_fare === 5000));
  });

  it("excludes synthetic quotes by default and demo never counts as observed", () => {
    const quotes = basket.flatMap((r) => LEAD_BINS.map((lead) => quote({ ...r, lead_time_days: lead, source: "synthetic", source_rank: 100 })));
    assert.ok(pickSnapshotCells(basket, quotes, day, at).every((c) => c.total_fare == null));
    const cells = pickSnapshotCells(basket, quotes, day, at, true);
    assert.equal(coverageForCells(basket, cells).coverage, 0);
    assert.equal(coverageForCells(basket, cells).vintage, "demo");
    const rows = compileIndex(cells.map((c) => ({ origin: c.origin, destination: c.destination, day, lead: c.lead_time_bin,
      fare: c.total_fare!, imputed: true, synthetic: true })), basket, day);
    assert.ok(rows.length > 0 && rows.every((r) => r.vintage === "demo"));
    assert.ok(rows.every((r) => r.coverage === 0));
  });
  it("coverage is weighted non-imputed lead-bin share and rejected Agent JSON is excluded", () => {
    const cells = pickSnapshotCells(basket, [quote(), quote({ lead_time_days: 7, source: 'agent:airindia', parser_accepted: false, total_fare: 1000 })], day, at);
    assert.ok(Math.abs(coverageForCells(basket, cells).coverage - 0.7 / 6) < 1e-9);
    assert.equal(cells.find((c) => c.destination === 'BOM' && c.lead_time_bin === 7)?.is_imputed, 1);
  });
});
