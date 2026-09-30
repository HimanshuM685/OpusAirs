"use client";

import { useState } from "react";

export default function BulletinPage() {
  const [frequency, setFrequency] = useState("monthly");
  return (
    <>
      <h1>Bulletin</h1>
      <p className="sub">Official extract. CSV includes methodology comments. Use the browser print dialog for a one-page copy.</p>
      <div className="panel">
        <label>
          Frequency{" "}
          <select value={frequency} onChange={(e) => setFrequency(e.target.value)}>
            <option value="daily">Daily</option>
            <option value="weekly">Weekly</option>
            <option value="monthly">Monthly</option>
          </select>
        </label>
        <p>
          <a href={`/v1/bulletin?frequency=${frequency}&format=csv`}>Download CSV</a>
        </p>
        <button type="button" onClick={() => window.print()}>Print</button>
        <iframe title="bulletin" src={`/v1/bulletin?frequency=${frequency}&format=json`} style={{ width: "100%", height: 360, border: "1px solid #d8deda", marginTop: 12 }} />
      </div>
    </>
  );
}
