"use client";

import { useEffect, useMemo, useState } from "react";
import { api, type HeatmapCell } from "@/lib/api";
import JellyAnimatedHero from "@/components/ui/jelly-animated-hero";

function color(v: number, min: number, max: number) {
  const t = max === min ? 0.5 : (v - min) / (max - min);
  // Emerald green (#0b3b2a) for low/stable -> Amber (#e8a54b) -> Red (#d9383a) for high spikes
  if (t < 0.5) {
    const r = Math.round(11 + t * 2 * (232 - 11));
    const g = Math.round(59 + t * 2 * (165 - 59));
    const b = Math.round(42 + t * 2 * (75 - 42));
    return `rgb(${r},${g},${b})`;
  } else {
    const t2 = (t - 0.5) * 2;
    const r = Math.round(232 + t2 * (217 - 232));
    const g = Math.round(165 - t2 * (165 - 56));
    const b = Math.round(75 - t2 * (75 - 58));
    return `rgb(${r},${g},${b})`;
  }
}

export default function HeatmapPage() {
  const [cells, setCells] = useState<HeatmapCell[]>([]);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    api<HeatmapCell[]>("/v1/heatmap")
      .then(setCells)
      .catch((e) => setErr(String(e)));
  }, []);

  const { routes, dates, map, min, max } = useMemo(() => {
    const routeSet = new Set<string>();
    const dateSet = new Set<string>();
    const m = new Map<string, number>();
    let mn = Infinity;
    let mx = -Infinity;
    for (const c of cells) {
      const route = `${c.origin}-${c.destination}`;
      routeSet.add(route);
      dateSet.add(c.period_date);
      m.set(`${route}|${c.period_date}`, c.value);
      mn = Math.min(mn, c.value);
      mx = Math.max(mx, c.value);
    }
    return {
      routes: [...routeSet].sort(),
      dates: [...dateSet].sort(),
      map: m,
      min: mn === Infinity ? 90 : mn,
      max: mx === -Infinity ? 110 : mx,
    };
  }, [cells]);

  return (
    <div style={{ maxWidth: "1280px", margin: "0 auto", paddingBottom: "60px" }}>
      <JellyAnimatedHero
        badgeText={`Matrix Resolution · ${routes.length} Sectors Logged`}
        title="Sector Index Heatmap"
        subtitle="Daily route-level APIx intensity matrix (100 = base window). Spot real-time price surges across trunk corridors."
        primaryCtaText="📊 View Dashboard"
        primaryCtaHref="/dashboard"
        secondaryCtaText="✈️ Search Routes"
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
            Sectors Monitored
          </div>
          <div style={{ fontSize: "32px", fontWeight: 800, color: "#0c1212" }}>
            {routes.length}
          </div>
          <div style={{ fontSize: "12px", color: "#0b3b2a", fontWeight: 600, marginTop: "6px" }}>
            City-Pair Corridors
          </div>
        </div>

        <div className="fade-in fade-in-delay-1" style={{ gridColumn: "span 3", background: "#ffffff", border: "1px solid #d8deda", borderRadius: "16px", padding: "20px 24px", boxShadow: "0 2px 8px rgba(11,59,42,0.04)" }}>
          <div style={{ fontSize: "12px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "#7c817b", marginBottom: "8px" }}>
            Historical Days
          </div>
          <div style={{ fontSize: "32px", fontWeight: 800, color: "#0b3b2a" }}>
            {dates.length}
          </div>
          <div style={{ fontSize: "12px", color: "#525854", marginTop: "6px" }}>
            Telemetry dates logged
          </div>
        </div>

        <div className="fade-in fade-in-delay-1" style={{ gridColumn: "span 3", background: "#ffffff", border: "1px solid #d8deda", borderRadius: "16px", padding: "20px 24px", boxShadow: "0 2px 8px rgba(11,59,42,0.04)" }}>
          <div style={{ fontSize: "12px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "#7c817b", marginBottom: "8px" }}>
            Lowest Index Floor
          </div>
          <div style={{ fontSize: "32px", fontWeight: 800, color: "#0b3b2a" }}>
            {min.toFixed(1)}
          </div>
          <div style={{ fontSize: "12px", color: "#525854", marginTop: "6px" }}>
            Favorable fare period
          </div>
        </div>

        <div className="fade-in fade-in-delay-1" style={{ gridColumn: "span 3", background: "#ffffff", border: "1px solid #d8deda", borderRadius: "16px", padding: "20px 24px", boxShadow: "0 2px 8px rgba(11,59,42,0.04)" }}>
          <div style={{ fontSize: "12px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "#7c817b", marginBottom: "8px" }}>
            Peak Index Spike
          </div>
          <div style={{ fontSize: "32px", fontWeight: 800, color: "#d9383a" }}>
            {max.toFixed(1)}
          </div>
          <div style={{ fontSize: "12px", color: "#525854", marginTop: "6px" }}>
            Highest recorded surge
          </div>
        </div>

        {/* Heatmap Matrix Panel (12-cols) */}
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
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
            <h2 style={{ fontSize: "18px", fontWeight: 700, color: "#0c1212", margin: 0 }}>
              Daily Sector Intensity Matrix
            </h2>

            {/* Legend */}
            <div style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "12px", color: "#525854" }}>
              <span>Low ({min.toFixed(0)})</span>
              <div style={{ width: "16px", height: "16px", borderRadius: "4px", background: color(min, min, max) }} />
              <div style={{ width: "16px", height: "16px", borderRadius: "4px", background: color((min + max) / 2, min, max) }} />
              <div style={{ width: "16px", height: "16px", borderRadius: "4px", background: color(max, min, max) }} />
              <span>High ({max.toFixed(0)})</span>
            </div>
          </div>

          <div style={{ overflowX: "auto", paddingBottom: "12px" }}>
            <div
              className="heat"
              style={{
                gridTemplateColumns: `130px repeat(${Math.max(dates.length, 1)}, 16px)`,
                gap: "4px",
              }}
            >
              <div />
              {dates.map((d) => (
                <div key={d} title={d} style={{ fontSize: 0, height: 16 }} />
              ))}
              {routes.map((route) => (
                <div key={route} style={{ display: "contents" }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: "#0c1212", lineHeight: "18px", display: "flex", alignItems: "center" }}>
                    {route}
                  </div>
                  {dates.map((d) => {
                    const v = map.get(`${route}|${d}`);
                    return (
                      <div
                        key={`${route}|${d}`}
                        className="heat-cell"
                        title={`${route} (${d}): APIx ${v ? v.toFixed(2) : "n/a"}`}
                        style={{
                          width: "16px",
                          height: "18px",
                          borderRadius: "3px",
                          background: v == null ? "#ebf2ee" : color(v, min, max),
                          cursor: "pointer",
                          transition: "transform 0.1s ease",
                        }}
                      />
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
