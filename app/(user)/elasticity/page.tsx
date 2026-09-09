"use client";

import { useEffect, useState } from "react";
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

export default function ElasticityPage() {
  const [rows, setRows] = useState<ElasticityPoint[]>([]);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    api<ElasticityPoint[]>("/v1/elasticity")
      .then(setRows)
      .catch((e) => setErr(String(e)));
  }, []);

  return (
    <>
      <h1>Lead-time elasticity</h1>
      <p className="sub">
        Mean observed total fare by advance-purchase window (T+1 through T+45). Last-minute tickets
        are typically the most expensive.
      </p>
      {err && <p className="err">{err}</p>}
      <div className="panel" style={{ height: 380 }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={rows}>
            <CartesianGrid stroke="#243049" />
            <XAxis dataKey="lead_time_days" stroke="#93a0bd" label={{ value: "Days ahead", position: "bottom", fill: "#93a0bd" }} />
            <YAxis stroke="#93a0bd" />
            <Tooltip />
            <Line type="monotone" dataKey="mean_total_fare" stroke="#3ecf8e" strokeWidth={2} />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <div className="panel">
        <table>
          <thead>
            <tr>
              <th>Lead time (days)</th>
              <th>Mean total fare (INR)</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.lead_time_days}>
                <td>T+{r.lead_time_days}</td>
                <td>{r.mean_total_fare.toLocaleString("en-IN")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
