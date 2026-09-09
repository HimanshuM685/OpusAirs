"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { api, type IndexPoint } from "@/lib/api";
import GlyphPortal from "@/components/ui/glyph-portal";
import { GradientWave } from "@/components/ui/gradient-wave";

const family = '"Outfit", "Inter", sans-serif';

export default function LandingPage() {
  const [latestIdx, setLatestIdx] = useState<number | null>(null);

  useEffect(() => {
    api<IndexPoint[]>("/v1/index?frequency=daily&series=apix_laspeyres")
      .then((rows) => {
        if (rows.length) setLatestIdx(rows[rows.length - 1].value);
      })
      .catch(() => { });
  }, []);

  return (
    <div className="page-open-animate" style={{ width: "100%", minHeight: "100vh", background: "var(--bg-base, #ffffff)", color: "var(--text-primary, #0c1212)" }}>
      <style>{`
        .opus-header {
          position: absolute;
          inset: clamp(20px, 3.5vw, 40px) clamp(24px, 4vw, 48px) auto;
          display: flex;
          align-items: center;
          justify-content: space-between;
          z-index: 10;
        }
        .opus-eyebrow {
          position: absolute;
          inset: auto 24px calc(100% - var(--gp-word-top, 38%) + 18px);
          margin: 0;
          text-align: center;
        }
        .opus-support {
          position: absolute;
          inset: calc(var(--gp-word-bottom, 54%) + 24px) 24px auto;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 16px;
          margin: 0;
          text-align: center;
        }
        @media (max-width: 640px) {
          .opus-eyebrow {
            bottom: calc(100% - var(--gp-word-top, 38%) + 10px);
          }
          .opus-support {
            top: calc(var(--gp-word-bottom, 54%) + 14px);
          }
        }
      `}</style>
      <GlyphPortal
        word="OPUSAIRS"
        fontFamily={family}
        fontWeight={900}
        scrollLength={2.4}
        interactive={true}
        annotations={false}
        enterLabel="Explore Index"
        style={{
          "--gp-paper": "#ffffff",
          "--gp-ink": "#0b3b2a",
          "--gp-field": "#0b3b2a",
          "--gp-foreground": "#fbfbfa",
        }}
        background={
          <GradientWave colors={["#0b3b2a", "#14573f", "#093023", "#0b3b2a", "#14573f", "#082d22"]} />
        }
        front={
          <>
            {/* Header */}
            <div className="opus-header">
              <span style={{ fontSize: "22px", fontWeight: 800, letterSpacing: "-0.03em", color: "#0b3b2a" }}>
                Opus<span style={{ color: "#14573f" }}>Airs</span>
              </span>
              <div
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "8px",
                  padding: "6px 16px",
                  borderRadius: "100px",
                  background: "rgba(11, 59, 42, 0.08)",
                  border: "1px solid rgba(11, 59, 42, 0.2)",
                  color: "#0b3b2a",
                  fontSize: "13px",
                  fontWeight: 600,
                }}
              >
                <span
                  style={{
                    width: "8px",
                    height: "8px",
                    borderRadius: "50%",
                    background: "#0b3b2a",
                    boxShadow: "0 0 8px #0b3b2a",
                  }}
                />
                Live Index: {latestIdx != null ? latestIdx.toFixed(2) : "100.00"}
              </div>
            </div>

            {/* Headline ABOVE Giant Word */}
            <div className="opus-eyebrow">
              <h1
                style={{
                  fontSize: "clamp(1.6rem, 3.8vw, 3rem)",
                  fontWeight: 800,
                  lineHeight: 1.1,
                  letterSpacing: "-0.03em",
                  color: "#0c1212",
                  margin: 0,
                }}
              >
                Airfare Price Index{" "}
                <span style={{ background: "linear-gradient(135deg, #0b3b2a 0%, #14573f 100%)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
                  in Real Time
                </span>
              </h1>
            </div>

            {/* Subtitle & Actions BELOW Giant Word */}
            <div className="opus-support">
              <p style={{ fontSize: "clamp(13px, 1.5vw, 16px)", color: "#525854", margin: 0, fontWeight: 500 }}>
                High-frequency aviation price index for NSO, MoSPI &amp; RBI
              </p>

              <div style={{ display: "flex", gap: "14px", justifyContent: "center" }}>
                <Link
                  href="/dashboard"
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "8px",
                    padding: "11px 22px",
                    borderRadius: "10px",
                    background: "linear-gradient(135deg, #0b3b2a, #14573f)",
                    color: "#ffffff",
                    fontSize: "14px",
                    fontWeight: 600,
                    textDecoration: "none",
                    boxShadow: "0 4px 14px rgba(11, 59, 42, 0.25)",
                  }}
                >
                  View Dashboard
                </Link>
                <Link
                  href="/search"
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "8px",
                    padding: "11px 22px",
                    borderRadius: "10px",
                    background: "#ffffff",
                    border: "1px solid #d8deda",
                    color: "#0c1212",
                    fontSize: "14px",
                    fontWeight: 600,
                    textDecoration: "none",
                    backdropFilter: "blur(10px)",
                  }}
                >
                  Search Flights
                </Link>
              </div>
            </div>
          </>
        }
      >
        {/* Revealed Portal Content */}
        <div style={{ maxWidth: "1100px", margin: "0 auto", padding: "40px 20px 80px", color: "#fbfbfa" }}>

          {/* Section 1: Project Overview */}
          <section style={{ marginBottom: "64px" }}>
            <div style={{ display: "inline-block", fontSize: "12px", fontWeight: 600, letterSpacing: "0.1em", textTransform: "uppercase", color: "#34d399", marginBottom: "12px" }}>
              About The Project
            </div>
            <h2 style={{ fontSize: "clamp(26px, 4vw, 42px)", fontWeight: 700, margin: "0 0 20px", lineHeight: 1.2, letterSpacing: "-0.02em", color: "#ffffff" }}>
              Official High-Frequency Aviation Inflation Intelligence
            </h2>
            <p style={{ fontSize: "17px", lineHeight: 1.7, color: "#d8deda", maxWidth: "800px" }}>
              OpusAirs (SIH 2026 · SIH26056) is a next-generation analytical platform built for the <strong style={{ color: "#ffffff" }}>Ministry of Statistics &amp; Programme Implementation (MoSPI)</strong> and the <strong style={{ color: "#ffffff" }}>Reserve Bank of India (RBI)</strong>. It automates daily fare collection across all domestic carriers to compute a real-time Laspeyres Airfare Price Index (APIx).
            </p>
          </section>

          {/* Section 2: Key Operational Metrics */}
          <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "20px", marginBottom: "64px" }}>
            <div style={{ background: "rgba(255, 255, 255, 0.08)", border: "1px solid rgba(255, 255, 255, 0.15)", borderRadius: "14px", padding: "22px 24px", backdropFilter: "blur(10px)" }}>
              <div style={{ fontSize: "32px", fontWeight: 800, color: "#34d399", marginBottom: "4px" }}>100+</div>
              <div style={{ fontSize: "14px", color: "#d8deda" }}>City-Pair Sectors</div>
            </div>
            <div style={{ background: "rgba(255, 255, 255, 0.08)", border: "1px solid rgba(255, 255, 255, 0.15)", borderRadius: "14px", padding: "22px 24px", backdropFilter: "blur(10px)" }}>
              <div style={{ fontSize: "32px", fontWeight: 800, color: "#6ee7b7", marginBottom: "4px" }}>4</div>
              <div style={{ fontSize: "14px", color: "#d8deda" }}>Major Airlines Tracked</div>
            </div>
            <div style={{ background: "rgba(255, 255, 255, 0.08)", border: "1px solid rgba(255, 255, 255, 0.15)", borderRadius: "14px", padding: "22px 24px", backdropFilter: "blur(10px)" }}>
              <div style={{ fontSize: "32px", fontWeight: 800, color: "#a7f3d0", marginBottom: "4px" }}>24h</div>
              <div style={{ fontSize: "14px", color: "#d8deda" }}>Collection Frequency</div>
            </div>
            <div style={{ background: "rgba(255, 255, 255, 0.08)", border: "1px solid rgba(255, 255, 255, 0.15)", borderRadius: "14px", padding: "22px 24px", backdropFilter: "blur(10px)" }}>
              <div style={{ fontSize: "32px", fontWeight: 800, color: "#ffffff", marginBottom: "4px" }}>100.0</div>
              <div style={{ fontSize: "14px", color: "#d8deda" }}>Base Normalized Index</div>
            </div>
          </section>

          {/* Section 3: Core Features */}
          <section style={{ marginBottom: "64px" }}>
            <h2 style={{ fontSize: "28px", fontWeight: 700, marginBottom: "32px", color: "#ffffff" }}>
              Platform Capabilities
            </h2>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: "24px" }}>
              <div style={{ background: "rgba(255, 255, 255, 0.08)", border: "1px solid rgba(255, 255, 255, 0.15)", borderRadius: "16px", padding: "24px", backdropFilter: "blur(10px)" }}>
                <h3 style={{ fontSize: "18px", fontWeight: 600, margin: "0 0 8px", color: "#ffffff" }}>Laspeyres Price Index</h3>
                <p style={{ fontSize: "14px", lineHeight: 1.6, color: "#d8deda", margin: 0 }}>
                  Computes daily, weekly, and monthly airfare index weighted by DGCA passenger volume statistics across primary routes.
                </p>
              </div>

              <div style={{ background: "rgba(255, 255, 255, 0.08)", border: "1px solid rgba(255, 255, 255, 0.15)", borderRadius: "16px", padding: "24px", backdropFilter: "blur(10px)" }}>
                <h3 style={{ fontSize: "18px", fontWeight: 600, margin: "0 0 8px", color: "#ffffff" }}>Route Search &amp; Compare</h3>
                <p style={{ fontSize: "14px", lineHeight: 1.6, color: "#d8deda", margin: 0 }}>
                  Search any domestic city-pair to instantly compare baseline vs tax breakdown across IndiGo, Air India, SpiceJet, and Akasa.
                </p>
              </div>

              <div style={{ background: "rgba(255, 255, 255, 0.08)", border: "1px solid rgba(255, 255, 255, 0.15)", borderRadius: "16px", padding: "24px", backdropFilter: "blur(10px)" }}>
                <h3 style={{ fontSize: "18px", fontWeight: 600, margin: "0 0 8px", color: "#ffffff" }}>Trend & Corridor Analysis</h3>
                <p style={{ fontSize: "14px", lineHeight: 1.6, color: "#d8deda", margin: 0 }}>
                  Track 30-day, 90-day, and 180-day price corridors with min/max bounds and carrier market share shifts.
                </p>
              </div>

              <div style={{ background: "rgba(255, 255, 255, 0.08)", border: "1px solid rgba(255, 255, 255, 0.15)", borderRadius: "16px", padding: "24px", backdropFilter: "blur(10px)" }}>
                <h3 style={{ fontSize: "18px", fontWeight: 600, margin: "0 0 8px", color: "#ffffff" }}>Sector Heatmap</h3>
                <p style={{ fontSize: "14px", lineHeight: 1.6, color: "#d8deda", margin: 0 }}>
                  Interactive geographic heatmaps highlighting price spikes across trunk, regional, and seasonal flight sectors.
                </p>
              </div>
            </div>
          </section>

          {/* Section 4: Statistical Methodology */}
          <section style={{ background: "rgba(255, 255, 255, 0.06)", border: "1px solid rgba(255, 255, 255, 0.15)", borderRadius: "16px", padding: "32px", marginBottom: "64px" }}>
            <h2 style={{ fontSize: "22px", fontWeight: 700, margin: "0 0 12px", color: "#ffffff" }}>Methodology &amp; Standards</h2>
            <p style={{ fontSize: "15px", lineHeight: 1.6, color: "#d8deda", margin: 0 }}>
              The index follows standard NSO Consumer Price Index (CPI) methodology with fixed-base Laspeyres weighting:
            </p>
            <div style={{ fontFamily: "monospace", background: "rgba(0, 0, 0, 0.2)", border: "1px solid rgba(255, 255, 255, 0.2)", padding: "16px", borderRadius: "8px", margin: "16px 0", fontSize: "14px", color: "#34d399" }}>
              APIx_t = ( Σ (P_it * Q_i0) / Σ (P_i0 * Q_i0) ) × 100
            </div>
            <p style={{ fontSize: "14px", lineHeight: 1.6, color: "#a7f3d0", margin: 0 }}>
              Where <em style={{ color: "#ffffff" }}>P_it</em> represents advance purchase fares collected at 7, 15, and 30-day windows, and <em style={{ color: "#ffffff" }}>Q_i0</em> denotes DGCA annual passenger weighting.
            </p>
          </section>

          {/* Footer */}
          <footer style={{ borderTop: "1px solid rgba(255, 255, 255, 0.15)", paddingTop: "32px", textAlign: "center", fontSize: "13px", color: "#a7f3d0" }}>
            <p style={{ margin: 0 }}>
              OpusAirs APIx · Smart India Hackathon 2026 (SIH26056) · Ministry of Statistics &amp; Programme Implementation / DIID
            </p>
          </footer>
        </div>
      </GlyphPortal>
    </div>
  );
}
