"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { api, type RouteOut, type SearchResult, type TrendPoint } from "@/lib/api";
import JellyAnimatedHero from "@/components/ui/jelly-animated-hero";

const TREND_WINDOWS = [
  { key: "30d", label: "30 Days" },
  { key: "3m", label: "3 Months" },
  { key: "6m", label: "6 Months" },
];

export default function SearchPage() {
  const [routes, setRoutes] = useState<RouteOut[]>([]);
  const [origin, setOrigin] = useState("CCU");
  const [dest, setDest] = useState("BOM");
  const [result, setResult] = useState<SearchResult | null>(null);
  const [trends, setTrends] = useState<TrendPoint[]>([]);
  const [trendWindow, setTrendWindow] = useState("30d");
  const [tripType, setTripType] = useState<"one_way" | "round_trip">("one_way");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    api<RouteOut[]>("/v1/routes")
      .then(setRoutes)
      .catch(() => {});
  }, []);

  // All unique airport codes
  const airports = useMemo(() => {
    const s = new Set<string>();
    routes.forEach((r) => {
      s.add(r.origin);
      s.add(r.destination);
    });
    return [...s].sort();
  }, [routes]);

  async function handleSearch() {
    const o = origin.trim().toUpperCase();
    const d = dest.trim().toUpperCase();
    if (o.length !== 3 || d.length !== 3) return;
    setLoading(true);
    setErr(null);
    try {
      const searchRes = await api<SearchResult>(
        `/v1/search?origin=${o}&dest=${d}&trip_type=${tripType}`,
      );
      setResult(searchRes);
      const trendRes = await api<TrendPoint[]>(
        `/v1/trends/${o}/${d}?window=${trendWindow}`,
      );
      setTrends(trendRes);
    } catch (e) {
      setErr(String(e));
    } finally {
      setLoading(false);
    }
  }

  // Fetch trends when window changes (if we already have a search)
  useEffect(() => {
    if (!result) return;
    api<TrendPoint[]>(
      `/v1/trends/${result.origin}/${result.destination}?window=${trendWindow}`,
    )
      .then(setTrends)
      .catch(() => {});
  }, [trendWindow, result]);

  // Carrier comparison — group by carrier, show cheapest per carrier
  const carrierCompare = useMemo(() => {
    if (!result) return [];
    const m = new Map<string, number>();
    for (const c of result.carriers) {
      const prev = m.get(c.carrier);
      if (prev == null || c.total_fare < prev) {
        m.set(c.carrier, c.total_fare);
      }
    }
    return [...m.entries()]
      .map(([carrier, fare]) => ({ carrier, fare }))
      .sort((a, b) => a.fare - b.fare);
  }, [result]);

  // Price change from trend data
  const priceChange = useMemo(() => {
    if (trends.length < 2) return null;
    const first = trends[0].avg_fare;
    const last = trends[trends.length - 1].avg_fare;
    return ((last - first) / first) * 100;
  }, [trends]);

  const [departDate, setDepartDate] = useState("2026-09-17");
  const [returnDate, setReturnDate] = useState("2026-09-24");
  const [adults, setAdults] = useState(1);
  const [childrenCount, setChildrenCount] = useState(0);
  const [infants, setInfants] = useState(0);
  const [travelClass, setTravelClass] = useState("Economy");
  const [concession, setConcession] = useState("None");
  const [showPromo, setShowPromo] = useState(false);
  const [promoCode, setPromoCode] = useState("");
  const [showPassengerModal, setShowPassengerModal] = useState(false);

  return (
    <div style={{ maxWidth: "1280px", margin: "0 auto", paddingBottom: "60px" }}>
      <JellyAnimatedHero
        badgeText="Route Intelligence &amp; Carrier Compare"
        title="Search Flights &amp; Compare Fares"
        subtitle="Search between any two domestic cities to compare baseline vs tax breakdowns across IndiGo, Air India, SpiceJet and Akasa."
        primaryCtaText="View Dashboard"
        primaryCtaHref="/dashboard"
        secondaryCtaText="Heatmap"
        secondaryCtaHref="/heatmap"
      />
      {err && <p className="err">{err}</p>}
      {loading && <p className="sub">Fetching live fares… this can take a few minutes.</p>}

      {/* Premium Airline Flight Search Bar matching User UI Spec */}
      <div
        className="fade-in"
        style={{
          background: "#ffffff",
          borderRadius: "20px",
          padding: "24px 32px",
          boxShadow: "0 10px 36px rgba(11, 59, 42, 0.08)",
          border: "1px solid #d8deda",
          marginBottom: "40px",
        }}
      >
        {/* Top Option Controls */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: "24px",
            fontSize: "14px",
            fontWeight: 600,
          }}
        >
          {/* Trip Type Selector */}
          <div style={{ display: "flex", alignItems: "center", gap: "24px", color: "#0c1212" }}>
            <label style={{ display: "inline-flex", alignItems: "center", gap: "8px", cursor: "pointer" }}>
              <input
                type="radio"
                name="trip_type"
                checked={tripType === "round_trip"}
                onChange={() => setTripType("round_trip")}
                style={{ accentColor: "#0b3b2a", width: "16px", height: "16px" }}
              />
              <span>Round Trip</span>
            </label>
            <label style={{ display: "inline-flex", alignItems: "center", gap: "8px", cursor: "pointer" }}>
              <input
                type="radio"
                name="trip_type"
                checked={tripType === "one_way"}
                onChange={() => setTripType("one_way")}
                style={{ accentColor: "#0b3b2a", width: "16px", height: "16px" }}
              />
              <span>One Way</span>
            </label>
            <button
              type="button"
              onClick={() => setTripType("round_trip")}
              style={{
                background: "none",
                border: "none",
                color: "#0b3b2a",
                fontWeight: 700,
                cursor: "pointer",
                padding: 0,
                fontSize: "14px",
              }}
            >
              Multi City
            </button>
          </div>

          {/* Right Promo Link */}
          <div style={{ position: "relative" }}>
            <button
              type="button"
              onClick={() => setShowPromo(!showPromo)}
              style={{
                background: "none",
                border: "none",
                color: "#0c1212",
                fontWeight: 700,
                cursor: "pointer",
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
                fontSize: "13px",
              }}
            >
              Add Promo Code <span style={{ fontSize: "11px" }}>▼</span>
            </button>
            {showPromo && (
              <div
                style={{
                  position: "absolute",
                  right: 0,
                  top: "28px",
                  background: "#ffffff",
                  border: "1px solid #d8deda",
                  borderRadius: "10px",
                  padding: "12px",
                  boxShadow: "0 6px 20px rgba(0,0,0,0.1)",
                  zIndex: 20,
                  display: "flex",
                  gap: "8px",
                }}
              >
                <input
                  type="text"
                  placeholder="PROMO2026"
                  value={promoCode}
                  onChange={(e) => setPromoCode(e.target.value)}
                  style={{
                    padding: "6px 12px",
                    borderRadius: "6px",
                    border: "1px solid #d8deda",
                    fontSize: "13px",
                  }}
                />
                <button
                  type="button"
                  style={{
                    background: "#0b3b2a",
                    color: "#ffffff",
                    border: "none",
                    borderRadius: "6px",
                    padding: "6px 14px",
                    fontSize: "12px",
                    fontWeight: 700,
                  }}
                >
                  Apply
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Main Search Controls Row */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            flexWrap: "wrap",
            gap: "16px",
            background: "#f9fafb",
            borderRadius: "16px",
            padding: "16px 20px",
            border: "1px solid #e5e7eb",
          }}
        >
          {/* FROM / TO Block with Swap Icon */}
          <div style={{ display: "flex", alignItems: "center", gap: "10px", flex: "1 1 240px", minWidth: "220px" }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: "11px", fontWeight: 700, textTransform: "uppercase", color: "#6b7280", marginBottom: "4px" }}>
                From
              </div>
              <input
                value={origin}
                maxLength={3}
                list="airport-codes"
                onChange={(e) => setOrigin(e.target.value.toUpperCase())}
                style={{
                  width: "100%",
                  border: "none",
                  background: "transparent",
                  fontSize: "22px",
                  fontWeight: 800,
                  color: "#0c1212",
                  letterSpacing: "0.02em",
                  outline: "none",
                }}
                placeholder="CCU"
              />
            </div>

            {/* Swap Button */}
            <button
              type="button"
              onClick={() => {
                const temp = origin;
                setOrigin(dest);
                setDest(temp);
              }}
              title="Swap Origin and Destination"
              style={{
                width: "36px",
                height: "36px",
                borderRadius: "50%",
                background: "#ffffff",
                border: "1px solid #d8deda",
                color: "#e11d48",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                cursor: "pointer",
                fontWeight: 800,
                fontSize: "16px",
                boxShadow: "0 2px 6px rgba(0,0,0,0.06)",
                flexShrink: 0,
                transition: "transform 0.2s ease",
              }}
            >
              ⇄
            </button>

            <div style={{ flex: 1 }}>
              <div style={{ fontSize: "11px", fontWeight: 700, textTransform: "uppercase", color: "#6b7280", marginBottom: "4px" }}>
                To
              </div>
              <input
                value={dest}
                maxLength={3}
                list="airport-codes"
                onChange={(e) => setDest(e.target.value.toUpperCase())}
                style={{
                  width: "100%",
                  border: "none",
                  background: "transparent",
                  fontSize: "22px",
                  fontWeight: 800,
                  color: "#0c1212",
                  letterSpacing: "0.02em",
                  outline: "none",
                }}
                placeholder="BOM"
              />
            </div>
          </div>

          <datalist id="airport-codes">
            {airports.map((a) => (
              <option key={a} value={a} />
            ))}
          </datalist>

          {/* Vertical Divider */}
          <div style={{ width: "1px", height: "36px", background: "#e5e7eb" }} />

          {/* Depart Date */}
          <div style={{ flex: "0 0 130px" }}>
            <div style={{ fontSize: "11px", fontWeight: 700, color: "#6b7280", marginBottom: "4px" }}>Depart</div>
            <input
              type="date"
              value={departDate}
              onChange={(e) => setDepartDate(e.target.value)}
              style={{
                border: "none",
                background: "transparent",
                fontSize: "13px",
                fontWeight: 700,
                color: "#0c1212",
                outline: "none",
                cursor: "pointer",
                width: "100%",
              }}
            />
          </div>

          {/* Vertical Divider */}
          <div style={{ width: "1px", height: "36px", background: "#e5e7eb" }} />

          {/* Return Date */}
          <div style={{ flex: "0 0 130px", opacity: tripType === "one_way" ? 0.4 : 1 }}>
            <div style={{ fontSize: "11px", fontWeight: 700, color: "#6b7280", marginBottom: "4px" }}>Return</div>
            <input
              type="date"
              disabled={tripType === "one_way"}
              value={returnDate}
              onChange={(e) => setReturnDate(e.target.value)}
              style={{
                border: "none",
                background: "transparent",
                fontSize: "13px",
                fontWeight: 700,
                color: "#0c1212",
                outline: "none",
                cursor: tripType === "one_way" ? "not-allowed" : "pointer",
                width: "100%",
              }}
            />
          </div>

          {/* Vertical Divider */}
          <div style={{ width: "1px", height: "36px", background: "#e5e7eb" }} />

          {/* Passenger(s) Selector */}
          <div style={{ flex: "1 1 180px", position: "relative" }}>
            <div style={{ fontSize: "11px", fontWeight: 700, color: "#6b7280", marginBottom: "4px" }}>Passenger(s)</div>
            <button
              type="button"
              onClick={() => setShowPassengerModal(!showPassengerModal)}
              style={{
                border: "none",
                background: "transparent",
                fontSize: "13px",
                fontWeight: 700,
                color: "#0c1212",
                outline: "none",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: "6px",
                padding: 0,
              }}
            >
              <span>Adult {adults}, Child {childrenCount}, Infant {infants}</span>
              <span style={{ fontSize: "10px", color: "#6b7280" }}>▼</span>
            </button>

            {/* Passenger Count Dropdown */}
            {showPassengerModal && (
              <div
                style={{
                  position: "absolute",
                  top: "44px",
                  left: 0,
                  background: "#ffffff",
                  border: "1px solid #d8deda",
                  borderRadius: "14px",
                  padding: "16px",
                  boxShadow: "0 10px 25px rgba(0,0,0,0.12)",
                  zIndex: 30,
                  width: "220px",
                }}
              >
                {[
                  ["Adults (12+ yrs)", adults, setAdults],
                  ["Children (2-11 yrs)", childrenCount, setChildrenCount],
                  ["Infants (< 2 yrs)", infants, setInfants],
                ].map(([label, val, setVal]: any) => (
                  <div key={label} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
                    <span style={{ fontSize: "13px", fontWeight: 600, color: "#0c1212" }}>{label}</span>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      <button
                        type="button"
                        onClick={() => setVal(Math.max(0, val - 1))}
                        style={{ width: "26px", height: "26px", borderRadius: "50%", border: "1px solid #d8deda", background: "#f3f4f6", fontWeight: 700, cursor: "pointer" }}
                      >
                        -
                      </button>
                      <span style={{ fontSize: "14px", fontWeight: 700 }}>{val}</span>
                      <button
                        type="button"
                        onClick={() => setVal(val + 1)}
                        style={{ width: "26px", height: "26px", borderRadius: "50%", border: "1px solid #d8deda", background: "#f3f4f6", fontWeight: 700, cursor: "pointer" }}
                      >
                        +
                      </button>
                    </div>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() => setShowPassengerModal(false)}
                  style={{ width: "100%", padding: "8px", background: "#0b3b2a", color: "#ffffff", border: "none", borderRadius: "8px", fontWeight: 700, fontSize: "13px", cursor: "pointer", marginTop: "4px" }}
                >
                  Done
                </button>
              </div>
            )}
          </div>

          {/* Vertical Divider */}
          <div style={{ width: "1px", height: "36px", background: "#e5e7eb" }} />

          {/* Class */}
          <div style={{ flex: "0 0 110px" }}>
            <div style={{ fontSize: "11px", fontWeight: 700, color: "#6b7280", marginBottom: "4px" }}>Class</div>
            <select
              value={travelClass}
              onChange={(e) => setTravelClass(e.target.value)}
              style={{
                border: "none",
                background: "transparent",
                fontSize: "13px",
                fontWeight: 700,
                color: "#0c1212",
                outline: "none",
                cursor: "pointer",
                width: "100%",
              }}
            >
              <option value="Economy">Economy</option>
              <option value="Premium Economy">Premium Economy</option>
              <option value="Business">Business</option>
            </select>
          </div>

          {/* Vertical Divider */}
          <div style={{ width: "1px", height: "36px", background: "#e5e7eb" }} />

          {/* Concession Type */}
          <div style={{ flex: "0 0 120px" }}>
            <div style={{ fontSize: "11px", fontWeight: 700, color: "#6b7280", marginBottom: "4px" }}>Concession Type</div>
            <select
              value={concession}
              onChange={(e) => setConcession(e.target.value)}
              style={{
                border: "none",
                background: "transparent",
                fontSize: "13px",
                fontWeight: 700,
                color: "#0c1212",
                outline: "none",
                cursor: "pointer",
                width: "100%",
              }}
            >
              <option value="None">None</option>
              <option value="Student">Student</option>
              <option value="Senior Citizen">Senior Citizen</option>
              <option value="Armed Forces">Armed Forces</option>
            </select>
          </div>

          {/* SEARCH Action Button */}
          <button
            type="button"
            onClick={() => void handleSearch()}
            disabled={loading || origin.trim().length !== 3 || dest.trim().length !== 3}
            style={{
              background: "linear-gradient(135deg, #0b3b2a, #14573f)",
              color: "#ffffff",
              border: "none",
              borderRadius: "12px",
              padding: "14px 28px",
              fontSize: "14px",
              fontWeight: 800,
              letterSpacing: "0.05em",
              cursor: "pointer",
              boxShadow: "0 4px 16px rgba(11, 59, 42, 0.25)",
              transition: "transform 0.2s ease, box-shadow 0.2s ease",
              marginLeft: "auto",
            }}
          >
            {loading ? "SEARCHING…" : "SEARCH"}
          </button>
        </div>
      </div>

      {/* Popular Flight Deals Section matching bottom image layout */}
      <div style={{ marginTop: "40px", marginBottom: "36px" }}>
        <h2 style={{ fontSize: "20px", fontWeight: 800, color: "#0c1212", marginBottom: "20px", letterSpacing: "-0.01em" }}>
          Popular Flight Deals
        </h2>
        <div style={{ display: "flex", gap: "16px", alignItems: "center", flexWrap: "wrap" }}>
          <fieldset style={{ flex: 1, minWidth: "260px", borderRadius: "10px", border: "1px solid #9ca3af", padding: "8px 16px" }}>
            <legend style={{ fontSize: "12px", fontWeight: 600, color: "#4b5563", padding: "0 6px" }}>From</legend>
            <input
              type="text"
              placeholder="Search city or airport"
              value={origin}
              onChange={(e) => setOrigin(e.target.value.toUpperCase())}
              style={{ width: "100%", border: "none", outline: "none", fontSize: "14px", color: "#0c1212", fontWeight: 600, background: "transparent" }}
            />
          </fieldset>

          <button
            type="button"
            onClick={() => {
              const temp = origin;
              setOrigin(dest);
              setDest(temp);
            }}
            style={{ width: "32px", height: "32px", borderRadius: "6px", border: "1px solid #d1d5db", background: "#f9fafb", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", fontSize: "14px" }}
          >
            ⇄
          </button>

          <fieldset style={{ flex: 1, minWidth: "260px", borderRadius: "10px", border: "1px solid #9ca3af", padding: "8px 16px" }}>
            <legend style={{ fontSize: "12px", fontWeight: 600, color: "#4b5563", padding: "0 6px" }}>To</legend>
            <input
              type="text"
              placeholder="Search city or airport"
              value={dest}
              onChange={(e) => setDest(e.target.value.toUpperCase())}
              style={{ width: "100%", border: "none", outline: "none", fontSize: "14px", color: "#0c1212", fontWeight: 600, background: "transparent" }}
            />
          </fieldset>

          <button
            type="button"
            onClick={() => void handleSearch()}
            style={{
              background: "#0b3b2a",
              color: "#ffffff",
              border: "none",
              borderRadius: "8px",
              padding: "14px 32px",
              fontSize: "14px",
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            Search
          </button>
        </div>
      </div>

      {result && (
        <>
          {result.fetched && (
            <p className="sub">Live fetch just ran for this pair. Warehouse updated.</p>
          )}
          {result.quote_count === 0 && !result.fetched && (
            <p className="sub">
              No {tripType === "round_trip" ? "round-trip" : "one-way"} quotes. Sign in to
              fetch one-way live, or dump fares on Admin → Data Dump (needed list shows gaps).
            </p>
          )}
          {/* Summary stats */}
          <div className="stat-row fade-in">
            <div className="stat-card">
              <div className="stat-label">Route</div>
              <div className="stat-value" style={{ fontSize: 22 }}>
                {result.origin} → {result.destination}
              </div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Cheapest fare</div>
              <div className="stat-value">
                {result.cheapest
                  ? `₹${result.cheapest.toLocaleString("en-IN")}`
                  : "—"}
              </div>
            </div>
            <div className="stat-card">
              <div className="stat-label">
                Price change ({trendWindow})
              </div>
              <div
                className={`stat-value ${priceChange != null && priceChange > 0 ? "up" : "down"}`}
              >
                {priceChange == null
                  ? "—"
                  : `${priceChange > 0 ? "+" : ""}${priceChange.toFixed(1)}%`}
              </div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Quotes found</div>
              <div className="stat-value">{result.quote_count}</div>
            </div>
          </div>

          {/* Carrier comparison bar chart */}
          {carrierCompare.length > 0 && (
            <div className="panel fade-in">
              <h2>Carrier Price Comparison</h2>
              <div style={{ height: 220 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={carrierCompare} layout="vertical">
                    <CartesianGrid stroke="#e1ebe5" />
                    <XAxis
                      type="number"
                      stroke="#7c817b"
                      tick={{ fontSize: 12, fill: "#525854" }}
                      tickFormatter={(v: number) => `₹${v.toLocaleString("en-IN")}`}
                    />
                    <YAxis
                      type="category"
                      dataKey="carrier"
                      stroke="#7c817b"
                      tick={{ fontSize: 13, fill: "#0c1212", fontWeight: 600 }}
                      width={50}
                    />
                    <Tooltip
                      contentStyle={{
                        background: "#ffffff",
                        border: "1px solid #d8deda",
                        borderRadius: 8,
                        fontSize: 13,
                        color: "#0c1212",
                        boxShadow: "0 4px 12px rgba(11,59,42,0.1)",
                      }}
                      formatter={(v: number) => [
                        `₹${v.toLocaleString("en-IN")}`,
                        "Cheapest fare",
                      ]}
                    />
                    <Bar dataKey="fare" fill="#0b3b2a" radius={[0, 6, 6, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {/* Fare detail table */}
          <div className="panel fade-in">
            <h2>Fare Breakdown</h2>
            <div style={{ overflowX: "auto" }}>
              <table>
                <thead>
                  <tr>
                    <th>Carrier</th>
                    <th>Flight</th>
                    <th>Trip</th>
                    <th>Dep Date</th>
                    <th>Return</th>
                    <th>Lead</th>
                    <th>Base</th>
                    <th>Taxes</th>
                    <th>UDF</th>
                    <th>Conv.</th>
                    <th>Total</th>
                    <th>Collected</th>
                  </tr>
                </thead>
                <tbody>
                  {result.carriers.map((c, i) => (
                    <tr key={`${c.carrier}-${c.flight_no}-${c.dep_date}-${i}`}>
                      <td>
                        <span className="badge badge-ok">{c.carrier}</span>
                      </td>
                      <td>{c.flight_no}</td>
                      <td>{(c.trip_type || "one_way").replace("_", " ")}</td>
                      <td>{c.dep_date}</td>
                      <td>{c.return_date || "—"}</td>
                      <td>T+{c.lead_time_days}</td>
                      <td>₹{c.base_fare.toLocaleString("en-IN")}</td>
                      <td>₹{c.taxes.toLocaleString("en-IN")}</td>
                      <td>₹{c.udf.toLocaleString("en-IN")}</td>
                      <td>₹{c.convenience.toLocaleString("en-IN")}</td>
                      <td style={{ fontWeight: 600 }}>
                        ₹{c.total_fare.toLocaleString("en-IN")}
                      </td>
                      <td style={{ color: "var(--text-muted)" }}>
                        {c.collected_on}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Price Trends */}
          {trends.length > 0 && (
            <div className="panel fade-in">
              <div
                className="row"
                style={{
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: 16,
                }}
              >
                <h2 style={{ margin: 0 }}>Price Trends</h2>
                <div className="window-toggle">
                  {TREND_WINDOWS.map((w) => (
                    <button
                      key={w.key}
                      type="button"
                      className={trendWindow === w.key ? "active" : ""}
                      onClick={() => setTrendWindow(w.key)}
                    >
                      {w.label}
                    </button>
                  ))}
                </div>
              </div>
              <div style={{ height: 320 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={trends}>
                    <defs>
                      <linearGradient
                        id="trendGrad"
                        x1="0"
                        y1="0"
                        x2="0"
                        y2="1"
                      >
                        <stop
                          offset="5%"
                          stopColor="#0b3b2a"
                          stopOpacity={0.25}
                        />
                        <stop
                          offset="95%"
                          stopColor="#0b3b2a"
                          stopOpacity={0}
                        />
                      </linearGradient>
                    </defs>
                    <CartesianGrid stroke="#e1ebe5" />
                    <XAxis
                      dataKey="period_date"
                      stroke="#7c817b"
                      tick={{ fontSize: 12, fill: "#525854" }}
                    />
                    <YAxis
                      stroke="#7c817b"
                      tick={{ fontSize: 12, fill: "#525854" }}
                      tickFormatter={(v: number) => `₹${(v / 1000).toFixed(1)}k`}
                    />
                    <Tooltip
                      contentStyle={{
                        background: "#ffffff",
                        border: "1px solid #d8deda",
                        borderRadius: 8,
                        fontSize: 13,
                        color: "#0c1212",
                        boxShadow: "0 4px 12px rgba(11,59,42,0.1)",
                      }}
                      formatter={(v: number, name: string) => [
                        `₹${v.toLocaleString("en-IN")}`,
                        name === "avg_fare"
                          ? "Average"
                          : name === "min_fare"
                            ? "Min"
                            : "Max",
                      ]}
                    />
                    <Area
                      type="monotone"
                      dataKey="max_fare"
                      stroke="transparent"
                      fill="rgba(217,56,58,0.06)"
                    />
                    <Area
                      type="monotone"
                      dataKey="avg_fare"
                      stroke="#0b3b2a"
                      fill="url(#trendGrad)"
                      strokeWidth={2.5}
                    />
                    <Area
                      type="monotone"
                      dataKey="min_fare"
                      stroke="transparent"
                      fill="rgba(20,87,63,0.06)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
