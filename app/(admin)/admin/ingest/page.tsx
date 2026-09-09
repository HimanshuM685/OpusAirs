"use client";

import { useState } from "react";

const SAMPLE = `{
  "rebuild_index": true,
  "quotes": [
    {
      "source": "manual",
      "origin": "DEL",
      "destination": "BOM",
      "carrier": "6E",
      "flight_no": "6E201",
      "dep_date": "2026-09-17",
      "fare_class": "ECONOMY",
      "lead_time_days": 7,
      "collected_on": "2026-09-10",
      "base_fare": 4200,
      "taxes": 504,
      "udf": 350,
      "convenience": 0,
      "total_fare": 5054,
      "status": "ok"
    }
  ]
}`;

export default function IngestPage() {
  const [jsonText, setJsonText] = useState(SAMPLE);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function sendJson() {
    setErr(null);
    setMsg("Uploading JSON…");
    try {
      const res = await fetch(`/v1/ingest/quotes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: jsonText,
      });
      const body = await res.text();
      if (!res.ok) throw new Error(`${res.status} ${body}`);
      setMsg(body);
    } catch (e) {
      setErr(String(e));
      setMsg(null);
    }
  }

  async function sendCsv(file: File) {
    setErr(null);
    setMsg(`Uploading ${file.name}…`);
    const fd = new FormData();
    fd.append("file", file);
    try {
      const res = await fetch(`/v1/ingest/csv`, {
        method: "POST",
        body: fd,
      });
      const body = await res.text();
      if (!res.ok) throw new Error(`${res.status} ${body}`);
      setMsg(body);
    } catch (e) {
      setErr(String(e));
      setMsg(null);
    }
  }

  async function downloadTemplate() {
    const res = await fetch(`/v1/ingest/template`);
    const text = await res.text();
    const blob = new Blob([text], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "quotes_manual.example.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <>
      <h1>Feed quotes</h1>
      <p className="sub">
        Two collection paths: live portal scrape, and this manual feed.
        Paste JSON or upload the CSV schema. Same unique key upserts (correct a fare by sending it
        again). Only <code>total_fare</code> is required if you do not have the tax split.
      </p>
      {err && <p className="err">{err}</p>}
      {msg && <p className="sub">{msg}</p>}

      <div className="panel">
        <h2 style={{ marginTop: 0, fontSize: 18 }}>CSV upload</h2>
        <p className="sub">
          Columns: source, origin, destination, carrier, flight_no, dep_date, fare_class,
          lead_time_days, collected_on, base_fare, taxes, udf, convenience, total_fare, status
        </p>
        <div className="row">
          <button type="button" onClick={downloadTemplate}>
            Download CSV template
          </button>
          <input
            type="file"
            accept=".csv,text/csv"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void sendCsv(f);
            }}
          />
        </div>
      </div>

      <div className="panel">
        <h2 style={{ marginTop: 0, fontSize: 18 }}>JSON batch</h2>
        <textarea value={jsonText} onChange={(e) => setJsonText(e.target.value)} spellCheck={false} />
        <p>
          <button className="primary" type="button" onClick={() => void sendJson()}>
            Ingest JSON
          </button>
        </p>
      </div>
    </>
  );
}
