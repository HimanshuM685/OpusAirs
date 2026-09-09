"use client";

import React, { useState, type ReactNode } from "react";
import Link from "next/link";

export type JellyAnimatedHeroProps = {
  badgeText?: string;
  title?: ReactNode;
  subtitle?: string;
  primaryCtaText?: string;
  primaryCtaHref?: string;
  secondaryCtaText?: string;
  secondaryCtaHref?: string;
  children?: ReactNode;
};

export default function JellyAnimatedHero({
  badgeText = "Live Telemetry · Base 100.00",
  title,
  subtitle = "High-frequency aviation price index for NSO, MoSPI & RBI.",
  primaryCtaText = "📊 View Dashboard",
  primaryCtaHref = "/dashboard",
  secondaryCtaText = "✈️ Search Flights",
  secondaryCtaHref = "/search",
  children,
}: JellyAnimatedHeroProps) {
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const [isHovered, setIsHovered] = useState(false);

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = (e.clientX - rect.left - rect.width / 2) / 25;
    const y = (e.clientY - rect.top - rect.height / 2) / 25;
    setMousePos({ x, y });
  };

  return (
    <div
      onMouseMove={handleMouseMove}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => {
        setIsHovered(false);
        setMousePos({ x: 0, y: 0 });
      }}
      style={{
        position: "relative",
        overflow: "hidden",
        borderRadius: "24px",
        background: "linear-gradient(135deg, #0a0f1e 0%, #0f1b38 60%, #162244 100%)",
        border: "1px solid rgba(62, 88, 140, 0.3)",
        padding: "clamp(32px, 6vw, 64px) clamp(24px, 5vw, 48px)",
        boxShadow: "0 10px 30px rgba(0, 0, 0, 0.4)",
        marginBottom: "36px",
      }}
    >
      {/* Dynamic Keyframe Styles for Organic Jelly Elastic Motion */}
      <style>{`
        @keyframes jellyMorph1 {
          0%, 100% { border-radius: 60% 40% 30% 70% / 60% 30% 70% 40%; transform: rotate(0deg) scale(1); }
          50% { border-radius: 30% 60% 70% 30% / 50% 60% 30% 60%; transform: rotate(180deg) scale(1.1); }
        }
        @keyframes jellyMorph2 {
          0%, 100% { border-radius: 40% 60% 70% 30% / 40% 70% 30% 60%; transform: rotate(0deg) scale(1); }
          50% { border-radius: 70% 30% 40% 60% / 60% 40% 60% 40%; transform: rotate(-180deg) scale(1.15); }
        }
        @keyframes jellyPulse {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.25); }
        }
        .jelly-button {
          transition: transform 0.4s cubic-bezier(0.68, -0.6, 0.32, 1.6), box-shadow 0.3s ease, background 0.3s ease;
        }
        .jelly-button:hover {
          transform: scale(1.06) translateY(-2px);
        }
        .jelly-button:active {
          transform: scale(0.95, 1.05);
        }
        .jelly-card {
          transition: transform 0.45s cubic-bezier(0.175, 0.885, 0.32, 1.275), box-shadow 0.3s ease;
        }
        .jelly-card:hover {
          transform: translateY(-6px) scale(1.02);
          box-shadow: 0 12px 30px rgba(11, 59, 42, 0.12);
        }
      `}</style>

      {/* Floating Animated Jelly Blobs */}
      <div
        style={{
          position: "absolute",
          top: "-60px",
          left: "-60px",
          width: "280px",
          height: "280px",
          background: "radial-gradient(circle, rgba(52, 211, 153, 0.18) 0%, rgba(11, 59, 42, 0.05) 70%, transparent 100%)",
          animation: "jellyMorph1 12s ease-in-out infinite",
          transform: `translate(${mousePos.x * 1.5}px, ${mousePos.y * 1.5}px)`,
          transition: isHovered ? "transform 0.1s ease-out" : "transform 0.8s ease-out",
          pointerEvents: "none",
        }}
      />
      <div
        style={{
          position: "absolute",
          bottom: "-80px",
          right: "-80px",
          width: "340px",
          height: "340px",
          background: "radial-gradient(circle, rgba(11, 59, 42, 0.12) 0%, rgba(20, 87, 63, 0.04) 70%, transparent 100%)",
          animation: "jellyMorph2 16s ease-in-out infinite",
          transform: `translate(${-mousePos.x * 1.2}px, ${-mousePos.y * 1.2}px)`,
          transition: isHovered ? "transform 0.1s ease-out" : "transform 0.8s ease-out",
          pointerEvents: "none",
        }}
      />

      {/* Hero Content Layer */}
      <div style={{ position: "relative", zIndex: 2, textContent: "center", textAlign: "center", maxWidth: "840px", margin: "0 auto" }}>
        
        {/* Jelly Badge */}
        {badgeText && (
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "8px",
              padding: "6px 18px",
              borderRadius: "100px",
              background: "rgba(232, 165, 75, 0.15)",
              border: "1px solid rgba(232, 165, 75, 0.3)",
              color: "#e8a54b",
              fontSize: "13px",
              fontWeight: 700,
              boxShadow: "0 2px 10px rgba(0, 0, 0, 0.2)",
              marginBottom: "20px",
              transition: "transform 0.3s cubic-bezier(0.68, -0.6, 0.32, 1.6)",
            }}
          >
            <span
              style={{
                width: "8px",
                height: "8px",
                borderRadius: "50%",
                background: "#e8a54b",
                boxShadow: "0 0 10px #e8a54b",
                animation: "jellyPulse 2s infinite ease-in-out",
              }}
            />
            {badgeText}
          </div>
        )}

        {/* Hero Title */}
        <h1
          style={{
            fontSize: "clamp(2rem, 5vw, 3.6rem)",
            fontWeight: 800,
            lineHeight: 1.1,
            letterSpacing: "-0.035em",
            color: "#e8edf8",
            margin: "0 0 16px",
          }}
        >
          {title ?? (
            <>
              Airfare Price Index{" "}
              <span
                style={{
                  background: "linear-gradient(135deg, #e8a54b 0%, #f0c27f 100%)",
                  WebkitBackgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                }}
              >
                in Real Time
              </span>
            </>
          )}
        </h1>

        {/* Subtitle */}
        {subtitle && (
          <p
            style={{
              fontSize: "clamp(14px, 1.8vw, 17px)",
              lineHeight: 1.6,
              color: "#8a9bbd",
              maxWidth: "600px",
              margin: "0 auto 28px",
              fontWeight: 500,
            }}
          >
            {subtitle}
          </p>
        )}

        {/* Action Buttons */}
        <div style={{ display: "flex", gap: "14px", justifyContent: "center", flexWrap: "wrap", marginBottom: children ? "32px" : 0 }}>
          {primaryCtaText && (
            <Link
              href={primaryCtaHref}
              className="jelly-button"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "8px",
                padding: "12px 26px",
                borderRadius: "12px",
                background: "linear-gradient(135deg, #2563eb, #3b82f6)",
                color: "#ffffff",
                fontSize: "14px",
                fontWeight: 700,
                textDecoration: "none",
                boxShadow: "0 4px 14px rgba(37, 99, 235, 0.35)",
              }}
            >
              {primaryCtaText}
            </Link>
          )}

          {secondaryCtaText && (
            <Link
              href={secondaryCtaHref}
              className="jelly-button"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "8px",
                padding: "12px 26px",
                borderRadius: "12px",
                background: "rgba(17, 29, 54, 0.8)",
                border: "1px solid rgba(62, 88, 140, 0.4)",
                color: "#e8edf8",
                fontSize: "14px",
                fontWeight: 700,
                textDecoration: "none",
                boxShadow: "0 2px 8px rgba(0,0,0,0.2)",
              }}
            >
              {secondaryCtaText}
            </Link>
          )}
        </div>

        {/* Optional Slotted Children (e.g. quick stats or search inputs) */}
        {children}
      </div>
    </div>
  );
}
