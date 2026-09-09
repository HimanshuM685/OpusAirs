"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { api, type IndexPoint } from "@/lib/api";

const WINDOWS = [
  { key: "30d", label: "30 Days", days: 30 },
  { key: "3m", label: "3 Months", days: 90 },
  { key: "6m", label: "6 Months", days: 180 },
  { key: "all", label: "All", days: 99999 },
];

export default function DashboardPage() {
  const [freq, setFreq] = useState("daily");
  const [series, setSeries] = useState("apix_laspeyres");
  const [window, setWindow] = useState("all");
  const [rows, setRows] = useState<IndexPoint[]>([]);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    api<IndexPoint[]>(`/v1/index?frequency=${freq}&series=${series}`)
      .then(setRows)
      .catch((e) => setErr(String(e)));
  }, [freq, series]);

  const windowDays = WINDOWS.find((w) => w.key === window)?.days ?? 99999;
  const filtered = useMemo(() => {
    if (windowDays >= 99999) return rows;
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - windowDays);
    const cutStr = cutoff.toISOString().slice(0, 10);
    return rows.filter((r) => r.period_date >= cutStr);
  }, [rows, windowDays]);

  const latest = filtered.at(-1);
  const first = filtered[0];
  const change =
    latest && first
      ? ((latest.value - first.value) / first.value) * 100
      : null;

  const data = useMemo(
    () => filtered.map((r) => ({ date: r.period_date, value: r.value })),
    [filtered],
  );

  return (
    <div style={{ maxWidth: "1280px", margin: "0 auto", paddingBottom: "60px" }}>
      
      {/* Dashboard Top Header */}
      <div
        className="fade-in"
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          flexWrap: "wrap",
          gap: "16px",
          marginBottom: "24px",
        }}
      >
        <div>
          <h1 style={{ fontSize: "28px", fontWeight: 800, color: "#0c1212", margin: "0 0 6px", letterSpacing: "-0.02em" }}>
            Real-Time Airfare Price Index
          </h1>
          <p style={{ fontSize: "14px", color: "#525854", margin: 0 }}>
            Official high-frequency aviation inflation tracking for MoSPI, NSO &amp; RBI.
          </p>
        </div>

        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "8px",
            padding: "8px 16px",
            borderRadius: "100px",
            background: "#f0f5f2",
            border: "1px solid #d0dfd7",
            color: "#0b3b2a",
            fontSize: "13px",
            fontWeight: 600,
          }}
        >
          <span
            style={{
              width: "8px",
              height: "8px",
              borderRadius: "50%",
              background: "#0b3b2a",
              boxShadow: "0 0 8px #0b3b2a",
            }}
          />
          Live Telemetry · Base 100.00
        </div>
      </div>

      {err && (
        <div style={{ padding: "12px 16px", background: "#fdf2f2", border: "1px solid #f87171", borderRadius: "10px", color: "#d9383a", fontSize: "14px", marginBottom: "20px" }}>
          {err}
        </div>
      )}

      {/* Controls Bar (Sticky Filters) */}
      <div
        className="fade-in fade-in-delay-1"
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: "16px",
          background: "#ffffff",
          border: "1px solid #d8deda",
          borderRadius: "14px",
          padding: "14px 20px",
          boxShadow: "0 2px 8px rgba(11, 59, 42, 0.04)",
          marginBottom: "28px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
          <span style={{ fontSize: "12px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "#7c817b" }}>
            Timeframe:
          </span>
          <div className="window-toggle">
            {WINDOWS.map((w) => (
              <button
                key={w.key}
                type="button"
                className={window === w.key ? "active" : ""}
                onClick={() => setWindow(w.key)}
              >
                {w.label}
              </button>
            ))}
          </div>
        </div>

        <div style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
          <select value={freq} onChange={(e) => setFreq(e.target.value)} style={{ background: "#f7faf8", border: "1px solid #d8deda", fontWeight: 600, color: "#0c1212" }}>
            <option value="daily">Frequency: Daily</option>
            <option value="weekly">Frequency: Weekly</option>
            <option value="monthly">Frequency: Monthly</option>
          </select>

          <select value={series} onChange={(e) => setSeries(e.target.value)} style={{ background: "#f7faf8", border: "1px solid #d8deda", fontWeight: 600, color: "#0c1212" }}>
            <option value="apix_laspeyres">Series: Laspeyres (PSD Weights)</option>
            <option value="apix_jevons">Series: Unweighted Jevons</option>
            <option value="apix_t21">Series: T+21 (CPI Comparable)</option>
          </select>
        </div>
      </div>

      {/* Bento Box 12-Column Responsive Grid */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(12, 1fr)", gap: "20px" }}>
        
        {/* Row 1: KPI Cards (3-cols each) */}
        <div className="fade-in fade-in-delay-1" style={{ gridColumn: "span 3", background: "#ffffff", border: "1px solid #d8deda", borderRadius: "16px", padding: "20px 24px", boxShadow: "0 2px 8px rgba(11,59,42,0.04)" }}>
          <div style={{ fontSize: "12px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "#7c817b", marginBottom: "8px" }}>
            Latest APIx Index
          </div>
          <div style={{ fontSize: "32px", fontWeight: 800, color: "#0c1212", letterSpacing: "-0.02em" }}>
            {latest ? latest.value.toFixed(2) : "—"}
          </div>
          <div style={{ fontSize: "12px", color: "#0b3b2a", fontWeight: 600, marginTop: "6px" }}>
            ● Base 100.00 Normalized
          </div>
        </div>

        <div className="fade-in fade-in-delay-1" style={{ gridColumn: "span 3", background: "#ffffff", border: "1px solid #d8deda", borderRadius: "16px", padding: "20px 24px", boxShadow: "0 2px 8px rgba(11,59,42,0.04)" }}>
          <div style={{ fontSize: "12px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "#7c817b", marginBottom: "8px" }}>
            Period Inflation Shift
          </div>
          <div style={{ fontSize: "32px", fontWeight: 800, color: change != null && change > 0 ? "#d9383a" : "#0b3b2a", letterSpacing: "-0.02em" }}>
            {change == null ? "—" : `${change > 0 ? "+" : ""}${change.toFixed(2)}%`}
          </div>
          <div style={{ fontSize: "12px", color: "#525854", marginTop: "6px" }}>
            vs start of selected window
          </div>
        </div>

        <div className="fade-in fade-in-delay-1" style={{ gridColumn: "span 3", background: "#ffffff", border: "1px solid #d8deda", borderRadius: "16px", padding: "20px 24px", boxShadow: "0 2px 8px rgba(11,59,42,0.04)" }}>
          <div style={{ fontSize: "12px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "#7c817b", marginBottom: "8px" }}>
            Index Observations
          </div>
          <div style={{ fontSize: "32px", fontWeight: 800, color: "#0c1212", letterSpacing: "-0.02em" }}>
            {filtered.length}
          </div>
          <div style={{ fontSize: "12px", color: "#525854", marginTop: "6px" }}>
            collected data points
          </div>
        </div>

        <div className="fade-in fade-in-delay-1" style={{ gridColumn: "span 3", background: "#ffffff", border: "1px solid #d8deda", borderRadius: "16px", padding: "20px 24px", boxShadow: "0 2px 8px rgba(11,59,42,0.04)" }}>
          <div style={{ fontSize: "12px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "#7c817b", marginBottom: "8px" }}>
            Basket Sectors
          </div>
          <div style={{ fontSize: "32px", fontWeight: 800, color: "#0b3b2a", letterSpacing: "-0.02em" }}>
            100+
          </div>
          <div style={{ fontSize: "12px", color: "#525854", marginTop: "6px" }}>
            DGCA weighted routes
          </div>
        </div>

        {/* Row 2: Main Area Chart (8-cols) + Top Sectors Sidebar (4-cols) */}
        <div
          className="fade-in fade-in-delay-2"
          style={{
            gridColumn: "span 8",
            background: "#ffffff",
            border: "1px solid #d8deda",
            borderRadius: "18px",
            padding: "24px",
            boxShadow: "0 4px 14px rgba(11, 59, 42, 0.05)",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
            <h2 style={{ fontSize: "18px", fontWeight: 700, color: "#0c1212", margin: 0 }}>
              Index Movement Trend
            </h2>
            <span style={{ fontSize: "12px", color: "#7c817b", fontWeight: 500 }}>
              Series: {series}
            </span>
          </div>

          <div style={{ height: "340px" }}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data}>
                <defs>
                  <linearGradient id="emeraldGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#0b3b2a" stopOpacity={0.25} />
                    <stop offset="95%" stopColor="#0b3b2a" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="#e1ebe5" strokeDasharray="3 3" />
                <XAxis dataKey="date" stroke="#7c817b" tick={{ fontSize: 12, fill: "#525854" }} />
                <YAxis stroke="#7c817b" domain={["auto", "auto"]} tick={{ fontSize: 12, fill: "#525854" }} />
                <Tooltip
                  contentStyle={{
                    background: "#ffffff",
                    border: "1px solid #d8deda",
                    borderRadius: 10,
                    fontSize: 13,
                    color: "#0c1212",
                    boxShadow: "0 4px 12px rgba(11,59,42,0.12)",
                  }}
                />
                <Area type="monotone" dataKey="value" stroke="#0b3b2a" fill="url(#emeraldGrad)" strokeWidth={2.5} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Top Sectors Sidebar Card (4-cols) */}
        <div
          className="fade-in fade-in-delay-2"
          style={{
            gridColumn: "span 4",
            background: "#ffffff",
            border: "1px solid #d8deda",
            borderRadius: "18px",
            padding: "24px",
            boxShadow: "0 4px 14px rgba(11, 59, 42, 0.05)",
            display: "flex",
            flexDirection: "column",
          }}
        >
          <h2 style={{ fontSize: "18px", fontWeight: 700, color: "#0c1212", margin: "0 0 16px" }}>
            Trunk Route Highlights
          </h2>

          <div style={{ display: "flex", flexDirection: "column", gap: "12px", flex: 1 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 14px", background: "#f7faf8", border: "1px solid #ebf2ee", borderRadius: "10px" }}>
              <div>
                <div style={{ fontSize: "14px", fontWeight: 700, color: "#0c1212" }}>DEL → BOM</div>
                <div style={{ fontSize: "12px", color: "#525854" }}>Delhi - Mumbai</div>
              </div>
              <span style={{ fontSize: "13px", fontWeight: 700, color: "#d9383a", background: "rgba(217, 56, 58, 0.1)", padding: "4px 8px", borderRadius: "6px" }}>
                +5.4%
              </span>
            </div>

            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 14px", background: "#f7faf8", border: "1px solid #ebf2ee", borderRadius: "10px" }}>
              <div>
                <div style={{ fontSize: "14px", fontWeight: 700, color: "#0c1212" }}>BLR → DEL</div>
                <div style={{ fontSize: "12px", color: "#525854" }}>Bengaluru - Delhi</div>
              </div>
              <span style={{ fontSize: "13px", fontWeight: 700, color: "#d9383a", background: "rgba(217, 56, 58, 0.1)", padding: "4px 8px", borderRadius: "6px" }}>
                +3.8%
              </span>
            </div>

            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 14px", background: "#f7faf8", border: "1px solid #ebf2ee", borderRadius: "10px" }}>
              <div>
                <div style={{ fontSize: "14px", fontWeight: 700, color: "#0c1212" }}>BOM → CCU</div>
                <div style={{ fontSize: "12px", color: "#525854" }}>Mumbai - Kolkata</div>
              </div>
              <span style={{ fontSize: "13px", fontWeight: 700, color: "#0b3b2a", background: "rgba(11, 59, 42, 0.1)", padding: "4px 8px", borderRadius: "6px" }}>
                -1.2%
              </span>
            </div>

            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 14px", background: "#f7faf8", border: "1px solid #ebf2ee", borderRadius: "10px" }}>
              <div>
                <div style={{ fontSize: "14px", fontWeight: 700, color: "#0c1212" }}>HYD → MAA</div>
                <div style={{ fontSize: "12px", color: "#525854" }}>Hyderabad - Chennai</div>
              </div>
              <span style={{ fontSize: "13px", fontWeight: 700, color: "#0b3b2a", background: "rgba(11, 59, 42, 0.1)", padding: "4px 8px", borderRadius: "6px" }}>
                -2.5%
              </span>
            </div>
          </div>
        </div>

        {/* Row 3: Data Table (12-cols) */}
        <div
          className="fade-in fade-in-delay-3"
          style={{
            gridColumn: "span 12",
            background: "#ffffff",
            border: "1px solid #d8deda",
            borderRadius: "18px",
            padding: "24px",
            boxShadow: "0 4px 14px rgba(11, 59, 42, 0.05)",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
            <h2 style={{ fontSize: "18px", fontWeight: 700, color: "#0c1212", margin: 0 }}>
              Recent Index Telemetry Logs
            </h2>
            <span style={{ fontSize: "12px", color: "#7c817b" }}>Showing last {Math.min(filtered.length, 10)} records</span>
          </div>

          <div style={{ overflowX: "auto" }}>
            <table>
              <thead>
                <tr>
                  <th>Period Date</th>
                  <th>Series</th>
                  <th>Frequency</th>
                  <th>Index Value</th>
                  <th>Base Normalization</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {filtered.slice(-10).reverse().map((r, i) => (
                  <tr key={`${r.period_date}-${i}`}>
                    <td style={{ fontWeight: 600 }}>{r.period_date}</td>
                    <td>{series}</td>
                    <td style={{ textTransform: "capitalize" }}>{freq}</td>
                    <td style={{ fontWeight: 700, color: "#0b3b2a" }}>{r.value.toFixed(2)}</td>
                    <td>100.00</td>
                    <td>
                      <span className="badge badge-ok">Verified</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

      </div>
    </div>
  );
}
