import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseItineraries, validQuote } from "./parse";

const FIXTURE = `
<article class="flight-card" data-flight="6E201" data-cabin="ECONOMY" data-total="5054"></article>
<article class="flight-card" data-flight="6E201" data-cabin="BUSINESS" data-total="12500"></article>
<article class="flight-card" data-flight="6E999" data-total="4000"></article>
<p>AI 801 ECONOMY INR 5,545</p>
<p>QP1122 PREMIUM ECONOMY ₹9,100</p>
<p>SG 12 ₹90000</p>
`;

describe("parseItineraries", () => {
  it("keeps every exposed cabin and ignores rows without a cabin or a sane fare", () => {
    const legs = parseItineraries(FIXTURE);
    assert.deepEqual(
      legs.map((l) => `${l.flight_no}:${l.fare_class}:${l.total_fare}`),
      ["6E201:ECONOMY:5054", "6E201:BUSINESS:12500", "AI801:ECONOMY:5545", "QP1122:PREMIUM_ECONOMY:9100"],
    );
  });

  it("rejects a quote missing origin, date, or fare", () => {
    assert.equal(validQuote({ origin: "DEL", destination: "BOM", dep_date: "2026-09-11", total_fare: 5054 }), true);
    assert.equal(validQuote({ origin: "DEL", destination: "BOM", dep_date: "10:30", total_fare: 5054 }), false);
    assert.equal(validQuote({ origin: "DEL", destination: "BOM", dep_date: "2026-09-11", total_fare: null }), false);
  });
});
