"use client";

import { useEffect, useState } from "react";
import { api, type BacktestSummary } from "@/lib/api";

export default function BacktestPage() {
  const [data, setData] = useState<BacktestSummary | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    api<BacktestSummary>("/v1/backtest/dgca")
      .then(setData)
      .catch((e) => setErr(String(e)));
  }, []);

  const national = data?.rows.filter((r) => !r.origin) ?? [];
  const routes = data?.rows.filter((r) => r.origin) ?? [];

  return (
    <>
      <h1>DGCA backtest</h1>
      <p className="sub">{data?.note}</p>
      {err && <p className="err">{err}</p>}
      <div className="row">
        <div className="card">
          <div className="k">Correlation (overlapping months)</div>
          <div className="v">{data?.correlation ?? "n/a"}</div>
        </div>
        <div className="card">
          <div className="k">Paired observations</div>
          <div className="v">{data?.n_pairs ?? 0}</div>
        </div>
      </div>
      <div className="panel">
        <table>
          <thead>
            <tr>
              <th>Month</th>
              <th>APIx monthly</th>
              <th>APIx MoM %</th>
              <th>DGCA / TMU</th>
              <th>TMU MoM %</th>
            </tr>
          </thead>
          <tbody>
            {national.map((r) => (
              <tr key={`${r.month}-${r.dgca_value}-${r.apix_monthly}`}>
                <td>{r.month}</td>
                <td>{r.apix_monthly?.toFixed(2) ?? "—"}</td>
                <td>{r.apix_mom_pct ?? "—"}</td>
                <td>{r.dgca_value?.toFixed(2) ?? "—"}</td>
                <td>{r.dgca_mom_pct ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="panel">
        <table>
          <thead>
            <tr>
              <th>Month</th>
              <th>Route</th>
              <th>APIx sample avg</th>
              <th>TMU-style avg</th>
            </tr>
          </thead>
          <tbody>
            {routes.slice(0, 48).map((r) => (
              <tr key={`${r.month}-${r.origin}-${r.destination}`}>
                <td>{r.month}</td>
                <td>
                  {r.origin}→{r.destination}
                </td>
                <td>{r.route_avg_fare?.toLocaleString("en-IN") ?? "—"}</td>
                <td>{r.dgca_route_avg?.toLocaleString("en-IN") ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
