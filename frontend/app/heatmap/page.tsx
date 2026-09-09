"use client";

import { useEffect, useMemo, useState } from "react";
import { api, type HeatmapCell } from "@/lib/api";

function color(v: number, min: number, max: number) {
  const t = max === min ? 0.5 : (v - min) / (max - min);
  const r = Math.round(30 + t * 200);
  const g = Math.round(80 + (1 - t) * 80);
  const b = Math.round(140 - t * 80);
  return `rgb(${r},${g},${b})`;
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
      min: mn,
      max: mx,
    };
  }, [cells]);

  return (
    <>
      <h1>Sector heatmap</h1>
      <p className="sub">Daily route-level APIx (100 = base window). Cooler is cheaper relative to base.</p>
      {err && <p className="err">{err}</p>}
      <div className="panel" style={{ overflow: "auto" }}>
        <div
          className="heat"
          style={{
            gridTemplateColumns: `120px repeat(${Math.max(dates.length, 1)}, 14px)`,
          }}
        >
          <div />
          {dates.map((d) => (
            <div key={d} title={d} style={{ fontSize: 0, height: 14 }} />
          ))}
          {routes.map((route) => (
            <div key={route} style={{ display: "contents" }}>
              <div style={{ fontSize: 12, color: "#93a0bd", lineHeight: "14px" }}>{route}</div>
              {dates.map((d) => {
                const v = map.get(`${route}|${d}`);
                return (
                  <div
                    key={`${route}|${d}`}
                    className="heat-cell"
                    title={`${route} ${d}: ${v ?? "n/a"}`}
                    style={{ background: v == null ? "#1a2236" : color(v, min, max) }}
                  />
                );
              })}
            </div>
          ))}
        </div>
        <div className="legend">
          <span>Lower</span>
          <div className="heat-cell" style={{ background: color(min, min, max) }} />
          <div className="heat-cell" style={{ background: color((min + max) / 2, min, max) }} />
          <div className="heat-cell" style={{ background: color(max, min, max) }} />
          <span>Higher</span>
        </div>
      </div>
    </>
  );
}
