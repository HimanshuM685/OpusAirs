"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { api, type IndexPoint } from "@/lib/api";

export default function LandingPage() {
  const [latestIdx, setLatestIdx] = useState<number | null>(null);

  useEffect(() => {
    api<IndexPoint[]>("/v1/index?frequency=daily&series=apix_laspeyres")
      .then((rows) => {
        if (rows.length) setLatestIdx(rows[rows.length - 1].value);
      })
      .catch(() => {});
  }, []);

  return (
    <>
      {/* ---- Hero ---- */}
      <section className="landing-hero">
        <div className="hero-badge">
          <span className="pulse" />
          Live Index
          {latestIdx != null && (
            <span style={{ marginLeft: 4, fontWeight: 700 }}>
              {latestIdx.toFixed(2)}
            </span>
          )}
        </div>

        <h1>
          India&rsquo;s <span className="highlight">Airfare Price Index</span>
          <br />
          in Real Time
        </h1>

        <p className="hero-sub">
          High-frequency fare collection across domestic carriers, powering a
          Laspeyres-weighted price index for NSO, MoSPI and RBI. Compare fares,
          track trends, and explore sector-level analytics.
        </p>

        <div className="hero-actions">
          <Link href="/dashboard" className="btn-primary btn" id="hero-cta-dashboard">
            📊 View Dashboard
          </Link>
          <Link href="/search" className="btn" id="hero-cta-search">
            ✈️ Search Flights
          </Link>
        </div>
      </section>

      {/* ---- Features ---- */}
      <section className="landing-features">
        <h2>Built for Statistical Precision</h2>
        <div className="features-grid">
          <div className="feature-card fade-in">
            <div
              className="icon"
              style={{ background: "var(--accent-gold-dim)", color: "var(--accent-gold)" }}
            >
              📈
            </div>
            <h3>Real-time Price Index</h3>
            <p>
              Daily, weekly and monthly Laspeyres index on a DGCA-weighted
              city-pair basket. Base period normalised to 100.
            </p>
          </div>

          <div className="feature-card fade-in fade-in-delay-1">
            <div
              className="icon"
              style={{ background: "var(--accent-blue-dim)", color: "var(--accent-blue)" }}
            >
              🔍
            </div>
            <h3>Route Search & Compare</h3>
            <p>
              Search any city pair and instantly compare fares across IndiGo, Air
              India, SpiceJet and Akasa with full tax breakdowns.
            </p>
          </div>

          <div className="feature-card fade-in fade-in-delay-2">
            <div
              className="icon"
              style={{ background: "var(--accent-green-dim)", color: "var(--accent-green)" }}
            >
              📉
            </div>
            <h3>Price Trend Analysis</h3>
            <p>
              Track fare movements over 30 days, 3 months and 6 months with
              min/max/average corridors and carrier-level breakdowns.
            </p>
          </div>

          <div className="feature-card fade-in fade-in-delay-3">
            <div
              className="icon"
              style={{ background: "var(--accent-red-dim)", color: "var(--accent-red)" }}
            >
              🗺️
            </div>
            <h3>Sector Heatmap</h3>
            <p>
              Visual heatmap of route-level index values across all basket
              sectors. Instantly spot expensive corridors.
            </p>
          </div>
        </div>
      </section>

      {/* ---- Footer ---- */}
      <footer className="landing-footer">
        <p>
          OpusAirs APIx · SIH 2026 (SIH26056) · Ministry of Statistics &amp;
          Programme Implementation / DIID
        </p>
      </footer>
    </>
  );
}
