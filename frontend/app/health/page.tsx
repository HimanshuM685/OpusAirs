"use client";

import { useEffect, useState } from "react";
import { API_KEY, API_URL, api, type CollectionHealth } from "@/lib/api";

export default function HealthPage() {
  const [rows, setRows] = useState<CollectionHealth[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  function load() {
    api<CollectionHealth[]>("/v1/health/collection")
      .then(setRows)
      .catch((e) => setErr(String(e)));
  }

  useEffect(() => {
    load();
  }, []);

  async function runMock() {
    setMsg("Running Playwright collect against mock airline…");
    const res = await fetch(`${API_URL}/v1/collect/run?mock=true`, {
      method: "POST",
      headers: { "X-API-Key": API_KEY },
    });
    setMsg(res.ok ? JSON.stringify(await res.json()) : `Failed ${res.status}`);
    load();
  }

  return (
    <>
      <h1>Collection health</h1>
      <p className="sub">
        Ethical collectors abort on CAPTCHA/challenge pages and record <code>blocked</code>. They do
        not rotate IPs or solve CAPTCHAs.
      </p>
      {err && <p className="err">{err}</p>}
      <p>
        <button className="primary" onClick={runMock} type="button">
          Collect from mock airline
        </button>
      </p>
      {msg && <p className="sub">{msg}</p>}
      <div className="panel">
        <table>
          <thead>
            <tr>
              <th>Source</th>
              <th>Status</th>
              <th>OK</th>
              <th>Missing</th>
              <th>Sold out</th>
              <th>Blocked</th>
              <th>Last run</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.source}>
                <td>{r.source}</td>
                <td>{r.status}</td>
                <td>{r.quotes_ok}</td>
                <td>{r.quotes_missing}</td>
                <td>{r.quotes_sold_out}</td>
                <td>{r.quotes_blocked}</td>
                <td>{r.last_finished_at || r.last_started_at || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
