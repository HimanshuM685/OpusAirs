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
    <>
      <h1 className="fade-in">Real-time Airfare Price Index</h1>
      <p className="sub fade-in fade-in-delay-1">
        Laspeyres APIx on a DGCA-weighted city-pair basket. Base period = 100.
        Taxes, UDF and convenience are included in the consumer-facing total.
      </p>
      {err && <p className="err">{err}</p>}

      {/* Stat cards */}
      <div className="stat-row fade-in fade-in-delay-1">
        <div className="stat-card">
          <div className="stat-label">Latest APIx</div>
          <div className="stat-value">
            {latest ? latest.value.toFixed(2) : "—"}
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Change vs window start</div>
          <div
            className={`stat-value ${change != null && change > 0 ? "up" : "down"}`}
          >
            {change == null ? "—" : `${change > 0 ? "+" : ""}${change.toFixed(2)}%`}
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Observations</div>
          <div className="stat-value">{filtered.length}</div>
        </div>
      </div>

      {/* Controls */}
      <div className="row fade-in fade-in-delay-2">
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
        <select value={freq} onChange={(e) => setFreq(e.target.value)}>
          <option value="daily">Daily</option>
          <option value="weekly">Weekly</option>
          <option value="monthly">Monthly</option>
        </select>
        <select value={series} onChange={(e) => setSeries(e.target.value)}>
          <option value="apix_laspeyres">Laspeyres (PSD weights)</option>
          <option value="apix_jevons">Unweighted Jevons</option>
          <option value="apix_t21">T+21 only (CPI 2024 comparable)</option>
        </select>
      </div>

      {/* Chart */}
      <div className="panel fade-in fade-in-delay-3" style={{ height: 400 }}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data}>
            <defs>
              <linearGradient id="emeraldGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#0b3b2a" stopOpacity={0.25} />
                <stop offset="95%" stopColor="#0b3b2a" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="#e1ebe5" />
            <XAxis
              dataKey="date"
              stroke="#7c817b"
              tick={{ fontSize: 12, fill: "#525854" }}
            />
            <YAxis
              stroke="#7c817b"
              domain={["auto", "auto"]}
              tick={{ fontSize: 12, fill: "#525854" }}
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
            />
            <Area
              type="monotone"
              dataKey="value"
              stroke="#0b3b2a"
              fill="url(#emeraldGrad)"
              strokeWidth={2.5}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </>
  );
}
