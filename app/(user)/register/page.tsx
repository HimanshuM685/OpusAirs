"use client";

import Link from "next/link";
import { useState } from "react";
import { authClient } from "@/lib/auth/client";

function GoogleIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true" style={{ flexShrink: 0 }}>
      <path
        fill="#4285F4"
        d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.25v3.15C3.26 21.36 7.36 24 12 24z"
      />
      <path
        fill="#FBBC05"
        d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.13-1.55.38-2.27V6.58H1.25C.45 8.18 0 10.03 0 12s.45 3.82 1.25 5.42l4.03-3.15z"
      />
      <path
        fill="#EA4335"
        d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.36 0 3.26 2.64 1.25 6.58l4.03 3.15c.95-2.83 3.6-4.98 6.72-4.98z"
      />
    </svg>
  );
}

export default function RegisterPage() {
  const [err, setErr] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleGoogleSignUp() {
    setErr(null);
    setSubmitting(true);
    try {
      const res = await authClient.signIn.social({
        provider: "google",
        callbackURL: typeof window !== "undefined" ? window.location.origin + "/search" : "/search",
      });
      if (res?.error) {
        setErr(res.error.message || "Google registration failed. Please try again.");
        setSubmitting(false);
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Error initiating Google authentication");
      setSubmitting(false);
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-header">
          <div className="auth-icon" style={{ background: "rgba(11, 59, 42, 0.1)", color: "var(--brand-primary)" }}>
            ✨
          </div>
          <h1>Create Your Account</h1>
          <p>Join OpusAirs with your Google account to access real-time airfare analytics and price comparisons.</p>
        </div>

        {err && (
          <div className="auth-error" role="alert">
            <span>⚠️</span>
            <span>{err}</span>
          </div>
        )}

        <div style={{ marginTop: "24px" }}>
          <button
            type="button"
            onClick={handleGoogleSignUp}
            disabled={submitting}
            style={{
              width: "100%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "12px",
              padding: "14px 20px",
              fontSize: "15px",
              fontWeight: 600,
              color: "#0c1212",
              background: "#ffffff",
              border: "1px solid #d1d5db",
              borderRadius: "8px",
              cursor: submitting ? "not-allowed" : "pointer",
              boxShadow: "0 2px 6px rgba(0,0,0,0.06)",
              transition: "all 0.2s ease",
            }}
          >
            <GoogleIcon />
            <span>{submitting ? "Redirecting to Google…" : "Sign up with Google"}</span>
          </button>
        </div>

        <div style={{ marginTop: "24px", display: "flex", flexDirection: "column", gap: "10px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px", fontSize: "13px", color: "var(--text-secondary)" }}>
            <span>✈️</span>
            <span>Compare real-time airline fares with Indian domestic route benchmarks</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "10px", fontSize: "13px", color: "var(--text-secondary)" }}>
            <span>📈</span>
            <span>Analyze price gains over 30-day, 3-month, and 6-month windows</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "10px", fontSize: "13px", color: "var(--text-secondary)" }}>
            <span>🛡️</span>
            <span>Managed Better Auth powered by Neon Auth</span>
          </div>
        </div>

        <div className="auth-footer" style={{ marginTop: "28px" }}>
          <p>
            Already have an account?{" "}
            <Link href="/login" className="auth-footer-link">
              Sign in with Google
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
