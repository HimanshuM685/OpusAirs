"use client";

import type { BacktestSummary } from "@/lib/api";
import { useResource } from "@/lib/use-resource";
import { ResourceState } from "@/components/resource-state";

export default function BacktestPage() {
  const resource = useResource<BacktestSummary>("/v1/backtest/dgca");
  const data = resource.data;

  const national = data?.rows.filter((r) => !r.origin) ?? [];
  const routes = data?.rows.filter((r) => r.origin) ?? [];

  return (
    <>
      <h1>DGCA backtest</h1>
      <p className="sub">{data?.note}</p>
      <ResourceState {...resource} retry={resource.refresh} empty={Boolean(data) && !data?.rows.length} label="backtest comparisons" />
      <div className="row">
        <div className="card">
          <div className="k">Correlation (overlapping months)</div>
          <div className="v">{data?.correlation ?? "n/a"}</div>
        </div>
        <div className="card">
          <div className="k">MAPE</div>
          <div className="v">{data?.mape == null ? "n/a" : data.mape.toFixed(3)}</div>
        </div>
        <div className="card">
          <div className="k">RMSE {data?.provisional ? "(provisional, n < 3)" : ""}</div>
          <div className="v">{data?.rmse == null ? "n/a" : data.rmse.toFixed(2)}</div>
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
