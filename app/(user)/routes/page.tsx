"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { api, type RouteOut } from "@/lib/api";

export default function RoutesPage() {
  const [rows, setRows] = useState<RouteOut[]>([]);
  const [query, setQuery] = useState("");
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    api<RouteOut[]>("/v1/routes")
      .then(setRows)
      .catch((e) => setErr(String(e)));
  }, []);

  const filtered = useMemo(() => {
    if (!query.trim()) return rows;
    const q = query.toLowerCase().trim();
    return rows.filter(
      (r) =>
        r.origin.toLowerCase().includes(q) ||
        r.destination.toLowerCase().includes(q)
    );
  }, [rows, query]);

  const totalPassengers = useMemo(
    () => rows.reduce((acc, r) => acc + (r.raw_passengers || 0), 0),
    [rows]
  );

  return (
    <div style={{ maxWidth: "1280px", margin: "0 auto", paddingBottom: "60px" }}>
      {/* Header */}
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
            City-Pair Sectors &amp; PSD Basket
          </h1>
          <p style={{ fontSize: "14px", color: "#525854", margin: 0 }}>
            Official DGCA passenger-weighted route basket powering the Laspeyres index calculation.
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
          Basket Config: psd_basket.csv
        </div>
      </div>

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
            Basket Route Count
          </div>
          <div style={{ fontSize: "32px", fontWeight: 800, color: "#0c1212" }}>
            {rows.length}
          </div>
          <div style={{ fontSize: "12px", color: "#0b3b2a", fontWeight: 600, marginTop: "6px" }}>
            Primary Domestic Sectors
          </div>
        </div>

        <div className="fade-in fade-in-delay-1" style={{ gridColumn: "span 3", background: "#ffffff", border: "1px solid #d8deda", borderRadius: "16px", padding: "20px 24px", boxShadow: "0 2px 8px rgba(11,59,42,0.04)" }}>
          <div style={{ fontSize: "12px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "#7c817b", marginBottom: "8px" }}>
            Annual Passenger Volume
          </div>
          <div style={{ fontSize: "32px", fontWeight: 800, color: "#0b3b2a" }}>
            {(totalPassengers / 1_000_000).toFixed(1)}M
          </div>
          <div style={{ fontSize: "12px", color: "#525854", marginTop: "6px" }}>
            DGCA weighted traffic
          </div>
        </div>

        <div className="fade-in fade-in-delay-1" style={{ gridColumn: "span 3", background: "#ffffff", border: "1px solid #d8deda", borderRadius: "16px", padding: "20px 24px", boxShadow: "0 2px 8px rgba(11,59,42,0.04)" }}>
          <div style={{ fontSize: "12px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "#7c817b", marginBottom: "8px" }}>
            Average Sector Weight
          </div>
          <div style={{ fontSize: "32px", fontWeight: 800, color: "#0c1212" }}>
            {rows.length > 0 ? (100 / rows.length).toFixed(2) : "0"}%
          </div>
          <div style={{ fontSize: "12px", color: "#525854", marginTop: "6px" }}>
            Normalized basket share
          </div>
        </div>

        <div className="fade-in fade-in-delay-1" style={{ gridColumn: "span 3", background: "#ffffff", border: "1px solid #d8deda", borderRadius: "16px", padding: "20px 24px", boxShadow: "0 2px 8px rgba(11,59,42,0.04)" }}>
          <div style={{ fontSize: "12px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "#7c817b", marginBottom: "8px" }}>
            Top Trunk Sector
          </div>
          <div style={{ fontSize: "28px", fontWeight: 800, color: "#14573f" }}>
            DEL → BOM
          </div>
          <div style={{ fontSize: "12px", color: "#525854", marginTop: "6px" }}>
            Highest volume corridor
          </div>
        </div>

        {/* Filter Input & Table (12-cols) */}
        <div
          className="fade-in fade-in-delay-2"
          style={{
            gridColumn: "span 12",
            background: "#ffffff",
            border: "1px solid #d8deda",
            borderRadius: "18px",
            padding: "24px",
            boxShadow: "0 4px 14px rgba(11, 59, 42, 0.05)",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "16px", marginBottom: "20px" }}>
            <h2 style={{ fontSize: "18px", fontWeight: 700, color: "#0c1212", margin: 0 }}>
              Sectors &amp; Weight Distribution
            </h2>

            <input
              type="text"
              placeholder="Search route (e.g. DEL, BOM, BLR)..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              style={{ minWidth: "260px" }}
            />
          </div>

          <div style={{ overflowX: "auto" }}>
            <table>
              <thead>
                <tr>
                  <th>City-Pair Route</th>
                  <th>PSD Basket Weight</th>
                  <th>Annual Passengers</th>
                  <th>Latest APIx</th>
                  <th>Latest Avg Fare</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => (
                  <tr key={`${r.origin}-${r.destination}`}>
                    <td>
                      <span className="badge badge-ok" style={{ background: "#f0f5f2", color: "#0b3b2a", border: "1px solid #d0dfd7" }}>
                        {r.origin} → {r.destination}
                      </span>
                    </td>
                    <td>
                      <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                        <div style={{ width: "80px", height: "6px", background: "#ebf2ee", borderRadius: "3px", overflow: "hidden" }}>
                          <div style={{ width: `${Math.min(100, r.weight * 500)}%`, height: "100%", background: "#0b3b2a" }} />
                        </div>
                        <span style={{ fontWeight: 600 }}>{(r.weight * 100).toFixed(2)}%</span>
                      </div>
                    </td>
                    <td>{r.raw_passengers.toLocaleString("en-IN")}</td>
                    <td style={{ fontWeight: 700, color: "#0b3b2a" }}>{r.latest_index?.toFixed(2) ?? "—"}</td>
                    <td style={{ fontWeight: 600 }}>{r.latest_fare ? `₹${r.latest_fare.toLocaleString("en-IN")}` : "—"}</td>
                    <td>
                      <Link
                        href={`/search?origin=${r.origin}&dest=${r.destination}`}
                        className="btn"
                        style={{ padding: "4px 12px", fontSize: "12px" }}
                      >
                        Compare →
                      </Link>
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
