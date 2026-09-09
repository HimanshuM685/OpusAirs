"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { api, type RouteOut } from "@/lib/api";

export default function RoutesPage() {
  const [rows, setRows] = useState<RouteOut[]>([]);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    api<RouteOut[]>("/v1/routes")
      .then(setRows)
      .catch((e) => setErr(String(e)));
  }, []);

  return (
    <>
      <h1>PSD basket</h1>
      <p className="sub">Replace data/psd_basket.csv with official NSO/PSD weights without code changes.</p>
      {err && <p className="err">{err}</p>}
      <div className="panel">
        <table>
          <thead>
            <tr>
              <th>Route</th>
              <th>Weight</th>
              <th>Passengers (raw)</th>
              <th>Latest APIx</th>
              <th>Latest fare</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={`${r.origin}-${r.destination}`}>
                <td>
                  <Link href={`/routes/${r.origin}-${r.destination}`}>
                    {r.origin}→{r.destination}
                  </Link>
                </td>
                <td>{(r.weight * 100).toFixed(2)}%</td>
                <td>{r.raw_passengers.toLocaleString("en-IN")}</td>
                <td>{r.latest_index?.toFixed(2) ?? "—"}</td>
                <td>{r.latest_fare ? `₹${r.latest_fare.toLocaleString("en-IN")}` : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
