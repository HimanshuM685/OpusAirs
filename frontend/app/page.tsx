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
import { api, type IndexPoint } from "@/lib/api";

export default function HomePage() {
  const [freq, setFreq] = useState("daily");
  const [series, setSeries] = useState("apix_laspeyres");
  const [rows, setRows] = useState<IndexPoint[]>([]);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    api<IndexPoint[]>(`/v1/index?frequency=${freq}&series=${series}`)
      .then(setRows)
      .catch((e) => setErr(String(e)));
  }, [freq, series]);

  const latest = rows.at(-1);
  const first = rows[0];
  const change = latest && first ? ((latest.value - first.value) / first.value) * 100 : null;

  const data = useMemo(
    () => rows.map((r) => ({ date: r.period_date, value: r.value })),
    [rows],
  );

  return (
    <>
      <h1>Real-time Airfare Price Index</h1>
      <p className="sub">
        Laspeyres APIx on a DGCA-weighted city-pair basket. Base period = 100. Taxes, UDF and
        convenience are included in the consumer-facing total.
      </p>
      {err && <p className="err">{err}</p>}
      <div className="row">
        <div className="card">
          <div className="k">Latest APIx</div>
          <div className="v">{latest ? latest.value.toFixed(2) : "—"}</div>
        </div>
        <div className="card">
          <div className="k">Change vs base window</div>
          <div className={`v ${change != null && change > 0 ? "up" : "down"}`}>
            {change == null ? "—" : `${change.toFixed(2)}%`}
          </div>
        </div>
        <div className="card">
          <div className="k">Observations</div>
          <div className="v">{rows.length}</div>
        </div>
      </div>
      <div className="row">
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
      <div className="panel" style={{ height: 380 }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data}>
            <CartesianGrid stroke="#243049" />
            <XAxis dataKey="date" stroke="#93a0bd" tick={{ fontSize: 12 }} />
            <YAxis stroke="#93a0bd" domain={["auto", "auto"]} />
            <Tooltip />
            <Line type="monotone" dataKey="value" stroke="#e8a54b" dot={false} strokeWidth={2} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </>
  );
}
