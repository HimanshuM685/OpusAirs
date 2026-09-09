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
    <div style={{ width: "100%", minHeight: "100vh", background: "#ffffff", color: "#0c1212" }}>
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
          "--gp-ink": "#0c1212",
          "--gp-field": "#0b3b2a",
          "--gp-foreground": "#fbfbfa",
        }}
        background={
          <div
            style={{
              position: "absolute",
              inset: 0,
              background:
                "radial-gradient(circle at 18% 8%, rgba(68,125,98,.72), transparent 34%), radial-gradient(circle at 82% 20%, rgba(251,251,250,.12), transparent 28%), radial-gradient(circle at 48% 78%, rgba(9,48,35,.5), transparent 44%), linear-gradient(135deg,#0b3b2a 0%,#14573f 48%,#082d22 100%)",
            }}
          />
        }
        front={
          <div
            className="landing-hero"
            style={{
              minHeight: "100%",
              background: "transparent",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              textAlign: "center",
              padding: "2rem",
            }}
          >
            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "8px",
                padding: "6px 16px",
                borderRadius: "100px",
                background: "#f0f5f2",
                border: "1px solid #d0dfd7",
                color: "#0b3b2a",
                fontSize: "13px",
                fontWeight: 600,
                marginBottom: "24px",
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
              Live Index
              {latestIdx != null && (
                <span style={{ marginLeft: "4px", fontWeight: 700 }}>
                  {latestIdx.toFixed(2)}
                </span>
              )}
            </div>

            <h1
              style={{
                color: "#0c1212",
                fontSize: "clamp(2.2rem, 5.5vw, 4.4rem)",
                fontWeight: 800,
                lineHeight: 1.1,
                letterSpacing: "-0.03em",
                maxWidth: "22ch",
                margin: 0,
              }}
            >
              India&rsquo;s{" "}
              <span style={{ color: "#0b3b2a", background: "linear-gradient(135deg, #0b3b2a, #14573f)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
                Airfare Price Index
              </span>
              <br />
              in Real Time
            </h1>

            <p
              style={{
                color: "#525854",
                fontSize: "clamp(14px, 1.8vw, 17px)",
                lineHeight: 1.6,
                maxWidth: "54ch",
                margin: "18px auto 32px",
              }}
            >
              High-frequency fare collection across domestic carriers, powering a
              Laspeyres-weighted price index for NSO, MoSPI and RBI. Compare fares,
              track trends, and explore sector-level analytics.
            </p>

            <div style={{ display: "flex", gap: "14px", justifyContent: "center", flexWrap: "wrap" }}>
              <Link
                href="/dashboard"
                id="hero-cta-dashboard"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "8px",
                  padding: "12px 24px",
                  borderRadius: "10px",
                  background: "#0b3b2a",
                  color: "#ffffff",
                  fontSize: "14px",
                  fontWeight: 600,
                  boxShadow: "0 2px 8px rgba(11, 59, 42, 0.25)",
                  transition: "all 0.18s ease",
                  textDecoration: "none",
                }}
              >
                📊 View Dashboard
              </Link>
              <Link
                href="/search"
                id="hero-cta-search"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "8px",
                  padding: "12px 24px",
                  borderRadius: "10px",
                  background: "#ffffff",
                  border: "1px solid #d8deda",
                  color: "#0c1212",
                  fontSize: "14px",
                  fontWeight: 600,
                  boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
                  transition: "all 0.18s ease",
                  textDecoration: "none",
                }}
              >
                ✈️ Search Flights
              </Link>
            </div>
          </div>
        }
      >
        <div style={{ maxWidth: "1100px", margin: "0 auto", padding: "40px 20px" }}>
          {/* ---- Features ---- */}
          <section style={{ padding: "20px 0 60px" }}>
            <h2
              style={{
                textAlign: "center",
                marginBottom: "48px",
                fontSize: "clamp(24px, 3.5vw, 36px)",
                fontWeight: 700,
                color: "#fbfbfa",
                letterSpacing: "-0.02em",
              }}
            >
              Built for Statistical Precision
            </h2>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
                gap: "24px",
              }}
            >
              <div
                style={{
                  background: "rgba(255, 255, 255, 0.08)",
                  backdropFilter: "blur(12px)",
                  border: "1px solid rgba(251, 251, 250, 0.18)",
                  borderRadius: "16px",
                  padding: "28px 24px",
                  transition: "transform 0.2s ease, border-color 0.2s ease",
                }}
              >
                <div
                  style={{
                    width: "44px",
                    height: "44px",
                    borderRadius: "10px",
                    background: "rgba(251, 251, 250, 0.15)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: "20px",
                    marginBottom: "16px",
                  }}
                >
                  📈
                </div>
                <h3 style={{ fontSize: "18px", fontWeight: 600, color: "#fbfbfa", margin: "0 0 8px" }}>
                  Real-time Price Index
                </h3>
                <p style={{ fontSize: "14px", lineHeight: 1.6, color: "rgba(251, 251, 250, 0.8)", margin: 0 }}>
                  Daily, weekly and monthly Laspeyres index on a DGCA-weighted
                  city-pair basket. Base period normalised to 100.
                </p>
              </div>

              <div
                style={{
                  background: "rgba(255, 255, 255, 0.08)",
                  backdropFilter: "blur(12px)",
                  border: "1px solid rgba(251, 251, 250, 0.18)",
                  borderRadius: "16px",
                  padding: "28px 24px",
                  transition: "transform 0.2s ease, border-color 0.2s ease",
                }}
              >
                <div
                  style={{
                    width: "44px",
                    height: "44px",
                    borderRadius: "10px",
                    background: "rgba(251, 251, 250, 0.15)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: "20px",
                    marginBottom: "16px",
                  }}
                >
                  🔍
                </div>
                <h3 style={{ fontSize: "18px", fontWeight: 600, color: "#fbfbfa", margin: "0 0 8px" }}>
                  Route Search & Compare
                </h3>
                <p style={{ fontSize: "14px", lineHeight: 1.6, color: "rgba(251, 251, 250, 0.8)", margin: 0 }}>
                  Search any city pair and instantly compare fares across IndiGo, Air
                  India, SpiceJet and Akasa with full tax breakdowns.
                </p>
              </div>

              <div
                style={{
                  background: "rgba(255, 255, 255, 0.08)",
                  backdropFilter: "blur(12px)",
                  border: "1px solid rgba(251, 251, 250, 0.18)",
                  borderRadius: "16px",
                  padding: "28px 24px",
                  transition: "transform 0.2s ease, border-color 0.2s ease",
                }}
              >
                <div
                  style={{
                    width: "44px",
                    height: "44px",
                    borderRadius: "10px",
                    background: "rgba(251, 251, 250, 0.15)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: "20px",
                    marginBottom: "16px",
                  }}
                >
                  📉
                </div>
                <h3 style={{ fontSize: "18px", fontWeight: 600, color: "#fbfbfa", margin: "0 0 8px" }}>
                  Price Trend Analysis
                </h3>
                <p style={{ fontSize: "14px", lineHeight: 1.6, color: "rgba(251, 251, 250, 0.8)", margin: 0 }}>
                  Track fare movements over 30 days, 3 months and 6 months with
                  min/max/average corridors and carrier-level breakdowns.
                </p>
              </div>

              <div
                style={{
                  background: "rgba(255, 255, 255, 0.08)",
                  backdropFilter: "blur(12px)",
                  border: "1px solid rgba(251, 251, 250, 0.18)",
                  borderRadius: "16px",
                  padding: "28px 24px",
                  transition: "transform 0.2s ease, border-color 0.2s ease",
                }}
              >
                <div
                  style={{
                    width: "44px",
                    height: "44px",
                    borderRadius: "10px",
                    background: "rgba(251, 251, 250, 0.15)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: "20px",
                    marginBottom: "16px",
                  }}
                >
                  🗺️
                </div>
                <h3 style={{ fontSize: "18px", fontWeight: 600, color: "#fbfbfa", margin: "0 0 8px" }}>
                  Sector Heatmap
                </h3>
                <p style={{ fontSize: "14px", lineHeight: 1.6, color: "rgba(251, 251, 250, 0.8)", margin: 0 }}>
                  Visual heatmap of route-level index values across all basket
                  sectors. Instantly spot expensive corridors.
                </p>
              </div>
            </div>
          </section>

          {/* ---- Footer ---- */}
          <footer
            style={{
              borderTop: "1px solid rgba(251, 251, 250, 0.2)",
              paddingTop: "32px",
              textAlign: "center",
              fontSize: "13px",
              color: "rgba(251, 251, 250, 0.7)",
            }}
          >
            <p style={{ margin: 0 }}>
              OpusAirs APIx · SIH 2026 (SIH26056) · Ministry of Statistics &amp;
              Programme Implementation / DIID
            </p>
          </footer>
        </div>
      </GlyphPortal>
    </div>
  );
}
