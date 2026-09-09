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
    <div style={{ width: "100%", minHeight: "100vh", background: "var(--bg-base, #060b18)", color: "var(--text-primary, #e8edf8)" }}>
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
                "radial-gradient(ellipse 700px 500px at 20% 40%, rgba(59, 130, 246, 0.18) 0%, transparent 70%), radial-gradient(ellipse 600px 400px at 80% 60%, rgba(232, 165, 75, 0.12) 0%, transparent 70%), linear-gradient(135deg, #060b18 0%, #0c1527 50%, #111d36 100%)",
            }}
          />
        }
        front={
          <>
            {/* Header */}
            <div className="opus-header">
              <span style={{ fontSize: "22px", fontWeight: 800, letterSpacing: "-0.03em", color: "#e8edf8" }}>
                Opus<span style={{ color: "var(--accent-gold, #e8a54b)" }}>Airs</span>
              </span>
              <div
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "8px",
                  padding: "6px 16px",
                  borderRadius: "100px",
                  background: "rgba(232, 165, 75, 0.15)",
                  border: "1px solid rgba(232, 165, 75, 0.3)",
                  color: "#e8a54b",
                  fontSize: "13px",
                  fontWeight: 600,
                }}
              >
                <span
                  style={{
                    width: "8px",
                    height: "8px",
                    borderRadius: "50%",
                    background: "#e8a54b",
                    boxShadow: "0 0 8px #e8a54b",
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
                  color: "#e8edf8",
                  margin: 0,
                }}
              >
                Airfare Price Index{" "}
                <span style={{ background: "linear-gradient(135deg, #e8a54b 0%, #f0c27f 100%)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
                  in Real Time
                </span>
              </h1>
            </div>

            {/* Subtitle & Actions BELOW Giant Word */}
            <div className="opus-support">
              <p style={{ fontSize: "clamp(13px, 1.5vw, 16px)", color: "#8a9bbd", margin: 0, fontWeight: 500 }}>
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
                    background: "linear-gradient(135deg, #2563eb, #3b82f6)",
                    color: "#ffffff",
                    fontSize: "14px",
                    fontWeight: 600,
                    textDecoration: "none",
                    boxShadow: "0 4px 14px rgba(37,99,235,0.35)",
                  }}
                >
                  📊 View Dashboard
                </Link>
                <Link
                  href="/search"
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "8px",
                    padding: "11px 22px",
                    borderRadius: "10px",
                    background: "rgba(17, 29, 54, 0.8)",
                    border: "1px solid rgba(62, 88, 140, 0.4)",
                    color: "#e8edf8",
                    fontSize: "14px",
                    fontWeight: 600,
                    textDecoration: "none",
                    backdropFilter: "blur(10px)",
                  }}
                >
                  ✈️ Search Flights
                </Link>
              </div>
            </div>
          </>
        }
      >
        {/* Revealed Portal Content */}
        <div style={{ maxWidth: "1100px", margin: "0 auto", padding: "40px 20px 80px", color: "#e8edf8" }}>
          
          {/* Section 1: Project Overview */}
          <section style={{ marginBottom: "64px" }}>
            <div style={{ display: "inline-block", fontSize: "12px", fontWeight: 600, letterSpacing: "0.1em", textTransform: "uppercase", color: "#e8a54b", marginBottom: "12px" }}>
              About The Project
            </div>
            <h2 style={{ fontSize: "clamp(26px, 4vw, 42px)", fontWeight: 700, margin: "0 0 20px", lineHeight: 1.2, letterSpacing: "-0.02em", color: "#e8edf8" }}>
              Official High-Frequency Aviation Inflation Intelligence
            </h2>
            <p style={{ fontSize: "17px", lineHeight: 1.7, color: "#8a9bbd", maxWidth: "800px" }}>
              OpusAirs (SIH 2026 · SIH26056) is a next-generation analytical platform built for the <strong style={{ color: "#e8edf8" }}>Ministry of Statistics &amp; Programme Implementation (MoSPI)</strong> and the <strong style={{ color: "#e8edf8" }}>Reserve Bank of India (RBI)</strong>. It automates daily fare collection across all domestic carriers to compute a real-time Laspeyres Airfare Price Index (APIx).
            </p>
          </section>

          {/* Section 2: Key Operational Metrics */}
          <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "20px", marginBottom: "64px" }}>
            <div style={{ background: "rgba(17, 29, 54, 0.75)", border: "1px solid rgba(62, 88, 140, 0.3)", borderRadius: "14px", padding: "22px 24px", backdropFilter: "blur(10px)" }}>
              <div style={{ fontSize: "32px", fontWeight: 800, color: "#34d399", marginBottom: "4px" }}>100+</div>
              <div style={{ fontSize: "14px", color: "#8a9bbd" }}>City-Pair Sectors</div>
            </div>
            <div style={{ background: "rgba(17, 29, 54, 0.75)", border: "1px solid rgba(62, 88, 140, 0.3)", borderRadius: "14px", padding: "22px 24px", backdropFilter: "blur(10px)" }}>
              <div style={{ fontSize: "32px", fontWeight: 800, color: "#e8a54b", marginBottom: "4px" }}>4</div>
              <div style={{ fontSize: "14px", color: "#8a9bbd" }}>Major Airlines Tracked</div>
            </div>
            <div style={{ background: "rgba(17, 29, 54, 0.75)", border: "1px solid rgba(62, 88, 140, 0.3)", borderRadius: "14px", padding: "22px 24px", backdropFilter: "blur(10px)" }}>
              <div style={{ fontSize: "32px", fontWeight: 800, color: "#3b82f6", marginBottom: "4px" }}>24h</div>
              <div style={{ fontSize: "14px", color: "#8a9bbd" }}>Collection Frequency</div>
            </div>
            <div style={{ background: "rgba(17, 29, 54, 0.75)", border: "1px solid rgba(62, 88, 140, 0.3)", borderRadius: "14px", padding: "22px 24px", backdropFilter: "blur(10px)" }}>
              <div style={{ fontSize: "32px", fontWeight: 800, color: "#f07178", marginBottom: "4px" }}>100.0</div>
              <div style={{ fontSize: "14px", color: "#8a9bbd" }}>Base Normalized Index</div>
            </div>
          </section>

          {/* Section 3: Core Features */}
          <section style={{ marginBottom: "64px" }}>
            <h2 style={{ fontSize: "28px", fontWeight: 700, marginBottom: "32px", color: "#e8edf8" }}>
              Platform Capabilities
            </h2>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: "24px" }}>
              <div style={{ background: "rgba(17, 29, 54, 0.75)", border: "1px solid rgba(62, 88, 140, 0.3)", borderRadius: "16px", padding: "24px", backdropFilter: "blur(10px)" }}>
                <div style={{ fontSize: "24px", marginBottom: "12px" }}>📈</div>
                <h3 style={{ fontSize: "18px", fontWeight: 600, margin: "0 0 8px", color: "#e8edf8" }}>Laspeyres Price Index</h3>
                <p style={{ fontSize: "14px", lineHeight: 1.6, color: "#8a9bbd", margin: 0 }}>
                  Computes daily, weekly, and monthly airfare index weighted by DGCA passenger volume statistics across primary routes.
                </p>
              </div>

              <div style={{ background: "rgba(17, 29, 54, 0.75)", border: "1px solid rgba(62, 88, 140, 0.3)", borderRadius: "16px", padding: "24px", backdropFilter: "blur(10px)" }}>
                <div style={{ fontSize: "24px", marginBottom: "12px" }}>🔍</div>
                <h3 style={{ fontSize: "18px", fontWeight: 600, margin: "0 0 8px", color: "#e8edf8" }}>Route Search &amp; Compare</h3>
                <p style={{ fontSize: "14px", lineHeight: 1.6, color: "#8a9bbd", margin: 0 }}>
                  Search any domestic city-pair to instantly compare baseline vs tax breakdown across IndiGo, Air India, SpiceJet, and Akasa.
                </p>
              </div>

              <div style={{ background: "rgba(17, 29, 54, 0.75)", border: "1px solid rgba(62, 88, 140, 0.3)", borderRadius: "16px", padding: "24px", backdropFilter: "blur(10px)" }}>
                <div style={{ fontSize: "24px", marginBottom: "12px" }}>📉</div>
                <h3 style={{ fontSize: "18px", fontWeight: 600, margin: "0 0 8px", color: "#e8edf8" }}>Trend & Corridor Analysis</h3>
                <p style={{ fontSize: "14px", lineHeight: 1.6, color: "#8a9bbd", margin: 0 }}>
                  Track 30-day, 90-day, and 180-day price corridors with min/max bounds and carrier market share shifts.
                </p>
              </div>

              <div style={{ background: "rgba(17, 29, 54, 0.75)", border: "1px solid rgba(62, 88, 140, 0.3)", borderRadius: "16px", padding: "24px", backdropFilter: "blur(10px)" }}>
                <div style={{ fontSize: "24px", marginBottom: "12px" }}>🗺️</div>
                <h3 style={{ fontSize: "18px", fontWeight: 600, margin: "0 0 8px", color: "#e8edf8" }}>Sector Heatmap</h3>
                <p style={{ fontSize: "14px", lineHeight: 1.6, color: "#8a9bbd", margin: 0 }}>
                  Interactive geographic heatmaps highlighting price spikes across trunk, regional, and seasonal flight sectors.
                </p>
              </div>
            </div>
          </section>

          {/* Section 4: Statistical Methodology */}
          <section style={{ background: "rgba(17, 29, 54, 0.6)", border: "1px solid rgba(62, 88, 140, 0.3)", borderRadius: "16px", padding: "32px", marginBottom: "64px" }}>
            <h2 style={{ fontSize: "22px", fontWeight: 700, margin: "0 0 12px", color: "#e8edf8" }}>Methodology &amp; Standards</h2>
            <p style={{ fontSize: "15px", lineHeight: 1.6, color: "#8a9bbd", margin: 0 }}>
              The index follows standard NSO Consumer Price Index (CPI) methodology with fixed-base Laspeyres weighting:
            </p>
            <div style={{ fontFamily: "monospace", background: "rgba(6, 11, 24, 0.8)", border: "1px solid rgba(62, 88, 140, 0.3)", padding: "16px", borderRadius: "8px", margin: "16px 0", fontSize: "14px", color: "#e8a54b" }}>
              APIx_t = ( Σ (P_it * Q_i0) / Σ (P_i0 * Q_i0) ) × 100
            </div>
            <p style={{ fontSize: "14px", lineHeight: 1.6, color: "#5a6d8e", margin: 0 }}>
              Where <em style={{ color: "#8a9bbd" }}>P_it</em> represents advance purchase fares collected at 7, 15, and 30-day windows, and <em style={{ color: "#8a9bbd" }}>Q_i0</em> denotes DGCA annual passenger weighting.
            </p>
          </section>

          {/* Footer */}
          <footer style={{ borderTop: "1px solid rgba(62, 88, 140, 0.3)", paddingTop: "32px", textAlign: "center", fontSize: "13px", color: "#5a6d8e" }}>
            <p style={{ margin: 0 }}>
              OpusAirs APIx · Smart India Hackathon 2026 (SIH26056) · Ministry of Statistics &amp; Programme Implementation / DIID
            </p>
          </footer>
        </div>
      </GlyphPortal>
    </div>
  );
}
