"use client";

import { useEffect, useState } from "react";

type NeededCell = {
  origin: string;
  destination: string;
  trip_type: string;
  lead_time_days: number;
  last_collected_on: string | null;
  hint: string;
  dump_line: string;
};

const CSV_HEADER =
  "source,origin,destination,carrier,flight_no,dep_date,return_date,trip_type,lead_time_days,collected_on,base_fare,taxes,udf,convenience,total_fare,status";

const SAMPLE = `DEL-BOM 6E201 17 Sep economy, total 5054.
Round trip CCU-BOM IndiGo 12 Oct going 19 Oct return, total 11200.`;

export default function IngestPage() {
  const [dumpText, setDumpText] = useState(SAMPLE);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [needed, setNeeded] = useState<NeededCell[]>([]);
  const [fields, setFields] = useState<string[]>([]);

  function loadNeeded() {
    fetch("/v1/ingest/needed", { credentials: "include" })
      .then((r) => r.json())
      .then((d: { needed?: NeededCell[]; fields?: string[]; detail?: string }) => {
        if (d.detail) throw new Error(d.detail);
        setNeeded(d.needed || []);
        setFields(d.fields || []);
      })
      .catch((e) => setErr(String(e)));
  }

  useEffect(() => {
    loadNeeded();
  }, []);

  async function sendDump() {
    setErr(null);
    setMsg("Parsing dump…");
    try {
      const res = await fetch(`/v1/ingest/dump`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: dumpText, rebuild_index: true }),
      });
      const body = await res.text();
      if (!res.ok) throw new Error(`${res.status} ${body}`);
      setMsg(body);
      loadNeeded();
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
        credentials: "include",
        body: fd,
      });
      const body = await res.text();
      if (!res.ok) throw new Error(`${res.status} ${body}`);
      setMsg(body);
      loadNeeded();
    } catch (e) {
      setErr(String(e));
      setMsg(null);
    }
  }

  async function downloadTemplate() {
    const res = await fetch(`/v1/ingest/template`, { credentials: "include" });
    const text = await res.text();
    const blob = new Blob([text], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "quotes_manual.example.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  function fillFromNeeded(row: NeededCell) {
    setDumpText((prev) => {
      const first = prev.trim().split(/\n/, 1)[0] || "";
      if (!/origin/i.test(first) || !first.includes(",")) {
        return `${CSV_HEADER}\n${row.dump_line}`;
      }
      return `${prev.trim()}\n${row.dump_line}`;
    });
  }

  return (
    <>
      <h1>Feed quotes</h1>
      <p className="sub">
        Dump natural language, JSON, or CSV. One-way and round-trip both store as quotes.
        Prose uses Groq or OpenRouter if <code>GROQ_API_KEY</code> or{" "}
        <code>OPENROUTER_API_KEY</code> is set. JSON/CSV work without a key.
      </p>
      {err && <p className="err">{err}</p>}
      {msg && <p className="sub">{msg}</p>}

      <div className="panel">
        <h2 style={{ marginTop: 0, fontSize: 18 }}>What to collect</h2>
        <p className="sub">
          Required: origin, destination, dep_date, total_fare, trip_type (one_way or round_trip).
          Round trip: add return_date. Optional: carrier, flight_no, taxes split.
        </p>
        {fields.length > 0 && <p className="sub">{fields.join(" · ")}</p>}
        <p className="sub">{needed.length} stale or missing basket cells (T+1 / T+7 / T+21, both trip types).</p>
        <div style={{ overflowX: "auto", maxHeight: 320 }}>
          <table>
            <thead>
              <tr>
                <th>Route</th>
                <th>Trip</th>
                <th>Lead</th>
                <th>Last seen</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {needed.slice(0, 80).map((r) => (
                <tr key={`${r.origin}-${r.destination}-${r.trip_type}-${r.lead_time_days}`}>
                  <td>
                    {r.origin}→{r.destination}
                  </td>
                  <td>{r.trip_type.replace("_", " ")}</td>
                  <td>T+{r.lead_time_days}</td>
                  <td>{r.last_collected_on || "never"}</td>
                  <td>
                    <button type="button" onClick={() => fillFromNeeded(r)}>
                      Add CSV line
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="panel">
        <h2 style={{ marginTop: 0, fontSize: 18 }}>Dump (NL / JSON / CSV)</h2>
        <textarea value={dumpText} onChange={(e) => setDumpText(e.target.value)} spellCheck={false} rows={12} />
        <p>
          <button className="primary" type="button" onClick={() => void sendDump()}>
            Ingest dump
          </button>
        </p>
      </div>

      <div className="panel">
        <h2 style={{ marginTop: 0, fontSize: 18 }}>CSV file</h2>
        <p className="sub">
          Columns: source, origin, destination, carrier, flight_no, dep_date, return_date, trip_type,
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
    </>
  );
}
