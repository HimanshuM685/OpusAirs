"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { api, type IndexPoint, type QuoteOut } from "@/lib/api";

export default function RouteDetailPage() {
  const params = useParams<{ pair: string }>();
  const [origin, dest] = (params.pair || "DEL-BOM").split("-");
  const [idx, setIdx] = useState<IndexPoint[]>([]);
  const [quotes, setQuotes] = useState<QuoteOut[]>([]);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      api<IndexPoint[]>(`/v1/index/routes/${origin}/${dest}?frequency=daily`),
      api<QuoteOut[]>(`/v1/quotes?origin=${origin}&dest=${dest}&limit=40`),
    ])
      .then(([a, b]) => {
        setIdx(a);
        setQuotes(b);
      })
      .catch((e) => setErr(String(e)));
  }, [origin, dest]);

  return (
    <>
      <h1>
        {origin} → {dest}
      </h1>
      <p className="sub">Route-level APIx and recent cleaned quotes with fare components.</p>
      {err && <p className="err">{err}</p>}
      <div className="panel" style={{ height: 320 }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={idx.map((r) => ({ date: r.period_date, value: r.value }))}>
            <CartesianGrid stroke="#243049" />
            <XAxis dataKey="date" stroke="#93a0bd" />
            <YAxis stroke="#93a0bd" />
            <Tooltip />
            <Line type="monotone" dataKey="value" stroke="#e8a54b" dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <div className="panel">
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Carrier</th>
              <th>Lead</th>
              <th>Base</th>
              <th>Taxes</th>
              <th>UDF</th>
              <th>Conv.</th>
              <th>Total</th>
            </tr>
          </thead>
          <tbody>
            {quotes.map((q) => (
              <tr key={`${q.collected_on}-${q.carrier}-${q.flight_no}-${q.lead_time_days}`}>
                <td>{q.collected_on}</td>
                <td>{q.carrier}</td>
                <td>T+{q.lead_time_days}</td>
                <td>{q.base_fare.toLocaleString("en-IN")}</td>
                <td>{q.taxes.toLocaleString("en-IN")}</td>
                <td>{q.udf.toLocaleString("en-IN")}</td>
                <td>{q.convenience.toLocaleString("en-IN")}</td>
                <td>{q.total_fare.toLocaleString("en-IN")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
