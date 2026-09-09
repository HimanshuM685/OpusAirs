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

  async function runScrape() {
    setMsg("Running Playwright collect against live airline portals…");
    const res = await fetch(`${API_URL}/v1/collect/run?scrape=true`, {
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
        Live portal scrape checks robots.txt, rate-limits, and records <code>blocked</code> on
        CAPTCHA. It does not rotate IPs or solve challenges. If a source blocks, feed the same
        schema on <a href="/ingest">Feed quotes</a>.
      </p>
      {err && <p className="err">{err}</p>}
      <p>
        <button className="primary" onClick={() => void runScrape()} type="button">
          Scrape airline portals
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
