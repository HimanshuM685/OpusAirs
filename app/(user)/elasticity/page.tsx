"use client";

import { useEffect, useMemo, useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { api, type ElasticityPoint } from "@/lib/api";
import JellyAnimatedHero from "@/components/ui/jelly-animated-hero";

export default function ElasticityPage() {
  const [rows, setRows] = useState<ElasticityPoint[]>([]);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    api<ElasticityPoint[]>("/v1/elasticity")
      .then(setRows)
      .catch((e) => setErr(String(e)));
  }, []);

  const { t1Fare, t14Fare, t30Fare, premium } = useMemo(() => {
    const t1 = rows.find((r) => r.lead_time_days === 1)?.mean_total_fare;
    const t14 = rows.find((r) => r.lead_time_days === 14)?.mean_total_fare;
    const t30 = rows.find((r) => r.lead_time_days === 30)?.mean_total_fare;
    const p = t1 && t30 ? ((t1 - t30) / t30) * 100 : null;
    return {
      t1Fare: t1,
      t14Fare: t14,
      t30Fare: t30,
      premium: p,
    };
  }, [rows]);

  return (
    <div style={{ maxWidth: "1280px", margin: "0 auto", paddingBottom: "60px" }}>
      <JellyAnimatedHero
        badgeText={`Lead Window · T+1 through T+45 Days`}
        title="Advance Purchase Price Elasticity"
        subtitle="Mean observed total fare by booking window. Last-minute tickets (T+1) carry the highest surge premium vs T+30 advance bookings."
        primaryCtaText="📊 View Dashboard"
        primaryCtaHref="/dashboard"
        secondaryCtaText="✈️ Search Flights"
        secondaryCtaHref="/search"
      />

      {err && (
        <div style={{ padding: "12px 16px", background: "#fdf2f2", border: "1px solid #f87171", borderRadius: "10px", color: "#d9383a", fontSize: "14px", marginBottom: "20px" }}>
          {err}
        </div>
      )}

      {/* Bento Grid */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(12, 1fr)", gap: "20px" }}>
        
        {/* KPI Cards */}
        <div className="fade-in fade-in-delay-1" style={{ gridColumn: "span 3", background: "#ffffff", border: "1px solid #d8deda", borderRadius: "16px", padding: "20px 24px", boxShadow: "0 2px 8px rgba(11,59,42,0.04)" }}>
          <div style={{ fontSize: "12px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "#7c817b", marginBottom: "8px" }}>
            Last-Minute Fare (T+1)
          </div>
          <div style={{ fontSize: "32px", fontWeight: 800, color: "#d9383a" }}>
            {t1Fare ? `₹${t1Fare.toLocaleString("en-IN")}` : "—"}
          </div>
          <div style={{ fontSize: "12px", color: "#d9383a", fontWeight: 600, marginTop: "6px" }}>
            Peak departure pricing
          </div>
        </div>

        <div className="fade-in fade-in-delay-1" style={{ gridColumn: "span 3", background: "#ffffff", border: "1px solid #d8deda", borderRadius: "16px", padding: "20px 24px", boxShadow: "0 2px 8px rgba(11,59,42,0.04)" }}>
          <div style={{ fontSize: "12px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "#7c817b", marginBottom: "8px" }}>
            Mid-Window Fare (T+14)
          </div>
          <div style={{ fontSize: "32px", fontWeight: 800, color: "#0c1212" }}>
            {t14Fare ? `₹${t14Fare.toLocaleString("en-IN")}` : "—"}
          </div>
          <div style={{ fontSize: "12px", color: "#525854", marginTop: "6px" }}>
            Standard booking window
          </div>
        </div>

        <div className="fade-in fade-in-delay-1" style={{ gridColumn: "span 3", background: "#ffffff", border: "1px solid #d8deda", borderRadius: "16px", padding: "20px 24px", boxShadow: "0 2px 8px rgba(11,59,42,0.04)" }}>
          <div style={{ fontSize: "12px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "#7c817b", marginBottom: "8px" }}>
            Advance Fare (T+30)
          </div>
          <div style={{ fontSize: "32px", fontWeight: 800, color: "#0b3b2a" }}>
            {t30Fare ? `₹${t30Fare.toLocaleString("en-IN")}` : "—"}
          </div>
          <div style={{ fontSize: "12px", color: "#0b3b2a", fontWeight: 600, marginTop: "6px" }}>
            Baseline CPI reference
          </div>
        </div>

        <div className="fade-in fade-in-delay-1" style={{ gridColumn: "span 3", background: "#ffffff", border: "1px solid #d8deda", borderRadius: "16px", padding: "20px 24px", boxShadow: "0 2px 8px rgba(11,59,42,0.04)" }}>
          <div style={{ fontSize: "12px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "#7c817b", marginBottom: "8px" }}>
            T+1 Premium Surge
          </div>
          <div style={{ fontSize: "32px", fontWeight: 800, color: "#d9383a" }}>
            {premium != null ? `+${premium.toFixed(1)}%` : "—"}
          </div>
          <div style={{ fontSize: "12px", color: "#525854", marginTop: "6px" }}>
            vs advance T+30 booking
          </div>
        </div>

        {/* 8-col Elasticity Chart */}
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
              Lead-Time Fare Curve
            </h2>
            <span style={{ fontSize: "12px", color: "#7c817b" }}>T+1 (Right) to T+45 (Left)</span>
          </div>

          <div style={{ height: "340px" }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={rows}>
                <CartesianGrid stroke="#e1ebe5" strokeDasharray="3 3" />
                <XAxis
                  dataKey="lead_time_days"
                  stroke="#7c817b"
                  tick={{ fontSize: 12, fill: "#525854" }}
                  tickFormatter={(v: number) => `T+${v}`}
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
                    borderRadius: 10,
                    fontSize: 13,
                    color: "#0c1212",
                    boxShadow: "0 4px 12px rgba(11,59,42,0.12)",
                  }}
                  formatter={(v: number) => [`₹${v.toLocaleString("en-IN")}`, "Mean Fare"]}
                  labelFormatter={(v: number) => `Lead Time: T+${v} days`}
                />
                <Line
                  type="monotone"
                  dataKey="mean_total_fare"
                  stroke="#0b3b2a"
                  strokeWidth={3}
                  dot={{ fill: "#0b3b2a", r: 4 }}
                  activeDot={{ r: 7, fill: "#14573f" }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* 4-col Lead Time Data Table */}
        <div
          className="fade-in fade-in-delay-2"
          style={{
            gridColumn: "span 4",
            background: "#ffffff",
            border: "1px solid #d8deda",
            borderRadius: "18px",
            padding: "24px",
            boxShadow: "0 4px 14px rgba(11, 59, 42, 0.05)",
            maxHeight: "440px",
            overflowY: "auto",
          }}
        >
          <h2 style={{ fontSize: "18px", fontWeight: 700, color: "#0c1212", margin: "0 0 16px" }}>
            Lead-Time Breakdown
          </h2>

          <table>
            <thead>
              <tr>
                <th>Lead Window</th>
                <th>Mean Fare</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.lead_time_days}>
                  <td style={{ fontWeight: 600 }}>T+{r.lead_time_days} Days</td>
                  <td style={{ fontWeight: 700, color: r.lead_time_days <= 3 ? "#d9383a" : "#0b3b2a" }}>
                    ₹{r.mean_total_fare.toLocaleString("en-IN")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

      </div>
    </div>
  );
}
