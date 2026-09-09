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
      const searchRes = await api<SearchResult>(`/v1/search?origin=${o}&dest=${d}`);
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

  return (
    <>
      <h1 className="fade-in">Flight Search &amp; Price Compare</h1>
      <p className="sub fade-in fade-in-delay-1">
        Search any 3-letter IATA pair. If no quotes exist and you are signed in,
        live portals are fetched then. Anonymous search returns warehouse only.
      </p>
      {err && <p className="err">{err}</p>}
      {loading && <p className="sub">Fetching live fares… this can take a few minutes.</p>}

      {/* Search Box */}
      <div className="search-box fade-in fade-in-delay-1">
        <div className="search-fields">
          <div className="field">
            <label>Origin</label>
            <input
              id="search-origin"
              value={origin}
              maxLength={3}
              list="airport-codes"
              onChange={(e) => setOrigin(e.target.value.toUpperCase())}
            />
          </div>
          <div className="field">
            <label>Destination</label>
            <input
              id="search-dest"
              value={dest}
              maxLength={3}
              list="airport-codes"
              onChange={(e) => setDest(e.target.value.toUpperCase())}
            />
          </div>
          <datalist id="airport-codes">
            {airports.map((a) => (
              <option key={a} value={a} />
            ))}
          </datalist>
          <button
            className="primary"
            type="button"
            onClick={() => void handleSearch()}
            disabled={loading || origin.trim().length !== 3 || dest.trim().length !== 3}
            id="search-btn"
          >
            {loading ? "Fetching live fares…" : "Search"}
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
              No quotes yet. Sign in and search again to fetch live fares, or scrape from admin.
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
                    <CartesianGrid stroke="rgba(62,88,140,0.2)" />
                    <XAxis
                      type="number"
                      stroke="#5a6d8e"
                      tick={{ fontSize: 12, fill: "#8a9bbd" }}
                      tickFormatter={(v: number) => `₹${v.toLocaleString("en-IN")}`}
                    />
                    <YAxis
                      type="category"
                      dataKey="carrier"
                      stroke="#5a6d8e"
                      tick={{ fontSize: 13, fill: "#e8edf8", fontWeight: 600 }}
                      width={50}
                    />
                    <Tooltip
                      contentStyle={{
                        background: "#111d36",
                        border: "1px solid rgba(62,88,140,0.3)",
                        borderRadius: 8,
                        fontSize: 13,
                      }}
                      formatter={(v: number) => [
                        `₹${v.toLocaleString("en-IN")}`,
                        "Cheapest fare",
                      ]}
                    />
                    <Bar dataKey="fare" fill="#3b82f6" radius={[0, 6, 6, 0]} />
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
                    <th>Dep Date</th>
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
                      <td>{c.dep_date}</td>
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
                          stopColor="#34d399"
                          stopOpacity={0.3}
                        />
                        <stop
                          offset="95%"
                          stopColor="#34d399"
                          stopOpacity={0}
                        />
                      </linearGradient>
                    </defs>
                    <CartesianGrid stroke="rgba(62,88,140,0.2)" />
                    <XAxis
                      dataKey="period_date"
                      stroke="#5a6d8e"
                      tick={{ fontSize: 12, fill: "#8a9bbd" }}
                    />
                    <YAxis
                      stroke="#5a6d8e"
                      tick={{ fontSize: 12, fill: "#8a9bbd" }}
                      tickFormatter={(v: number) => `₹${(v / 1000).toFixed(1)}k`}
                    />
                    <Tooltip
                      contentStyle={{
                        background: "#111d36",
                        border: "1px solid rgba(62,88,140,0.3)",
                        borderRadius: 8,
                        fontSize: 13,
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
                      fill="rgba(240,113,120,0.08)"
                    />
                    <Area
                      type="monotone"
                      dataKey="avg_fare"
                      stroke="#34d399"
                      fill="url(#trendGrad)"
                      strokeWidth={2}
                    />
                    <Area
                      type="monotone"
                      dataKey="min_fare"
                      stroke="transparent"
                      fill="rgba(59,130,246,0.08)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}
        </>
      )}
    </>
  );
}
