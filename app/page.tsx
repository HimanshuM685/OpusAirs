"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { api, type IndexPoint } from "@/lib/api";
import GlyphPortal from "@/components/ui/glyph-portal";

const family = '"Outfit", "Inter", sans-serif';

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
    <div style={{ width: "100%", minHeight: "100vh", background: "var(--bg-base)", color: "var(--text-primary)" }}>
      <GlyphPortal
        word="OPUSAIRS"
        fontFamily={family}
        fontWeight={900}
        scrollLength={2.5}
        interactive={true}
        annotations={false}
        enterLabel="Explore Index"
        style={{
          "--gp-paper": "#060b18",
          "--gp-ink": "#e8edf8",
          "--gp-field": "#0c1527",
          "--gp-foreground": "#e8edf8",
        }}
        background={
          <div
            style={{
              position: "absolute",
              inset: 0,
              background:
                "radial-gradient(circle at 50% 30%, rgba(37, 99, 235, 0.25) 0%, transparent 60%), radial-gradient(circle at 80% 70%, rgba(232, 165, 75, 0.15) 0%, transparent 50%), linear-gradient(135deg, #060b18 0%, #0c1527 50%, #111d36 100%)",
            }}
          />
        }
        front={
          <div className="landing-hero" style={{ minHeight: "100%", background: "transparent" }}>
            <div className="hero-badge">
              <span className="pulse" />
              Live Index
              {latestIdx != null && (
                <span style={{ marginLeft: 6, fontWeight: 700 }}>
                  {latestIdx.toFixed(2)}
                </span>
              )}
            </div>

            <h1 style={{ fontSize: "clamp(2rem, 5vw, 4.2rem)", maxWidth: "22ch" }}>
              India&rsquo;s <span className="highlight">Airfare Price Index</span>
              <br />
              in Real Time
            </h1>

            <p className="hero-sub" style={{ maxWidth: "54ch", margin: "16px auto 28px" }}>
              High-frequency fare collection across domestic carriers, powering a
              Laspeyres-weighted price index for NSO, MoSPI and RBI. Compare fares,
              track trends, and explore sector-level analytics.
            </p>

            <div className="hero-actions" style={{ display: "flex", gap: "16px", justifyContent: "center" }}>
              <Link href="/dashboard" className="btn-primary btn" id="hero-cta-dashboard">
                📊 View Dashboard
              </Link>
              <Link href="/search" className="btn" id="hero-cta-search">
                ✈️ Search Flights
              </Link>
            </div>
          </div>
        }
      >
        <div style={{ maxWidth: "1100px", margin: "0 auto", padding: "40px 20px" }}>
          {/* ---- Features ---- */}
          <section className="landing-features" style={{ padding: "0 0 60px" }}>
            <h2 style={{ textAlign: "center", marginBottom: "40px", fontSize: "28px" }}>
              Built for Statistical Precision
            </h2>
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
          <footer className="landing-footer" style={{ borderTop: "1px solid var(--border)", paddingTop: "32px" }}>
            <p>
              OpusAirs APIx · SIH 2026 (SIH26056) · Ministry of Statistics &amp;
              Programme Implementation / DIID
            </p>
          </footer>
        </div>
      </GlyphPortal>
    </div>
  );
}
