"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { authClient, googleCallback } from "@/lib/auth/client";
import { GoogleIcon } from "@/components/google-icon";

const navLinks = [
  { href: "/admin", label: "Overview" },
  { href: "/admin/scrape", label: "Scrape & Health" },
  { href: "/admin/ingest", label: "Data Dump" },
  { href: "/admin/backtest", label: "DGCA Backtest" },
  { href: "/admin/bulletin", label: "Bulletin" },
];

export default function AdminLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [authState, setAuthState] = useState<{
    loading: boolean;
    authenticated: boolean;
    isAdmin: boolean;
    email: string | null;
    detail?: string;
  }>({
    loading: true,
    authenticated: false,
    isAdmin: false,
    email: null,
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/v1/admin/check", { credentials: "include", cache: "no-store" })
      .then((res) => res.json())
      .then((data: { authenticated?: boolean; isAdmin?: boolean; email?: string; detail?: string }) => {
        setAuthState({
          loading: false,
          authenticated: Boolean(data.authenticated),
          isAdmin: Boolean(data.isAdmin),
          email: data.email || null,
          detail: data.detail,
        });
      })
      .catch(() => {
        setAuthState({
          loading: false,
          authenticated: false,
          isAdmin: false,
          email: null,
        });
      });
  }, []);

  async function handleGoogleSignIn() {
    setError(null);
    setSubmitting(true);
    try {
      const res = await authClient.signIn.social({
        provider: "google",
        callbackURL: googleCallback(pathname),
      });
      if (res?.error) {
        setError(res.error.message || "Google sign in failed. Please try again.");
        setSubmitting(false);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error initiating Google authentication");
      setSubmitting(false);
    }
  }

  async function handleLogout() {
    try {
      const result = await authClient.signOut();
      if (result.error) throw new Error(result.error.message || "Sign out failed.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign out failed.");
      return;
    }
    setAuthState({
      loading: false,
      authenticated: false,
      isAdmin: false,
      email: null,
    });
    window.location.href = "/admin";
  }

  if (authState.loading) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "var(--bg-base)" }}>
        <p style={{ color: "var(--text-secondary)", fontSize: "14px" }}>Verifying operator session…</p>
      </div>
    );
  }

  // No managed Neon session.
  if (!authState.authenticated) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 24, background: "var(--bg-base)" }}>
        <div className="panel" style={{ width: "100%", maxWidth: 440, padding: "36px 32px", textAlign: "center" }}>
          <div style={{ fontSize: "36px", marginBottom: "12px" }}>🔐</div>
          <h1 style={{ marginTop: 0, fontSize: "24px", color: "var(--brand-primary)" }}>Operator Sign In</h1>
          <p className="sub" style={{ fontSize: "14px", lineHeight: "1.5", margin: "12px 0 24px" }}>
            OpusAirs administration uses <strong>Neon Auth</strong> with Google account authentication. Access is strictly restricted to accounts listed in <code>ADMIN_EMAILS</code>.
          </p>

          {error && (
            <div style={{ padding: "10px 14px", borderRadius: "8px", background: "rgba(220, 38, 38, 0.1)", border: "1px solid rgba(220, 38, 38, 0.3)", color: "var(--danger)", fontSize: "13px", marginBottom: "20px", textAlign: "left" }}>
              ⚠️ {error}
            </div>
          )}

          <button
            type="button"
            onClick={handleGoogleSignIn}
            disabled={submitting}
            style={{
              width: "100%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "12px",
              padding: "12px 20px",
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
            <span>{submitting ? "Redirecting to Google…" : "Continue with Google"}</span>
          </button>

          <p style={{ marginTop: 24, fontSize: "13px", color: "var(--text-muted)" }}>
            Need admin authorization? Add your Google address to the <code>ADMIN_EMAILS</code> environment variable.
          </p>

          <div style={{ marginTop: 20, paddingTop: 16, borderTop: "1px solid var(--border)" }}>
            <Link href="/" style={{ color: "var(--brand-primary)", textDecoration: "none", fontSize: "13px", fontWeight: 500 }}>
              ← Return to public portal
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // A public/password session or a non-allowlisted Google account cannot access admin.
  if (!authState.isAdmin) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 24, background: "var(--bg-base)" }}>
        <div className="panel" style={{ width: "100%", maxWidth: 460, padding: "36px 32px", textAlign: "center" }}>
          <div style={{ fontSize: "40px", marginBottom: "12px" }}>⛔</div>
          <h1 style={{ marginTop: 0, fontSize: "22px", color: "var(--danger)" }}>Access Denied</h1>
          <p style={{ fontSize: "14px", lineHeight: "1.6", color: "var(--text-secondary)", margin: "14px 0" }}>
            Signed in as <strong>{authState.email}</strong>. {authState.detail}
          </p>
          <div style={{ background: "var(--bg-elevated)", padding: "12px", borderRadius: "8px", border: "1px solid var(--border)", fontSize: "13px", color: "var(--text-muted)", marginBottom: "24px" }}>
            To grant access, add <code>{authState.email}</code> to <code>ADMIN_EMAILS</code> in your deployment environment variables.
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
            <button
              type="button"
              className="primary"
              onClick={handleGoogleSignIn}
              disabled={submitting}
              style={{ width: "100%" }}
            >
              Continue with an authorized Google account
            </button>
            <button
              type="button"
              onClick={() => void handleLogout()}
              style={{ width: "100%", background: "transparent", border: "1px solid var(--border)", color: "var(--text-secondary)", padding: "10px" }}
            >
              Sign out
            </button>
          </div>

          {error && <p className="auth-error" role="alert">{error}</p>}

          <div style={{ marginTop: 24, paddingTop: 16, borderTop: "1px solid var(--border)" }}>
            <Link href="/" style={{ color: "var(--brand-primary)", textDecoration: "none", fontSize: "13px", fontWeight: 500 }}>
              ← Return to public portal
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // Authorized Admin
  return (
    <div className="admin-shell">
      <aside className="admin-nav">
        <div className="brand">
          Opus<span>Airs</span>
        </div>
        <div className="tag">Operator Panel</div>
        {authState.email && (
          <div style={{ padding: "8px 12px", margin: "8px 0 16px", borderRadius: "6px", background: "rgba(11, 59, 42, 0.08)", fontSize: "12px", color: "var(--brand-primary)", wordBreak: "break-all" }}>
            <span style={{ display: "block", fontSize: "10px", textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text-muted)" }}>Operator</span>
            {authState.email}
          </div>
        )}
        {navLinks.map(({ href, label }) => (
          <Link key={href} href={href} className={pathname === href ? "active" : ""}>
            {label}
          </Link>
        ))}
        <div style={{ marginTop: "auto", paddingTop: 24 }}>
          {error && <p className="auth-error" role="alert">{error}</p>}
          <button type="button" onClick={() => void handleLogout()} style={{ width: "100%", cursor: "pointer" }}>
            Sign out
          </button>
          <div className="back-link">
            <Link href="/">← Public portal</Link>
          </div>
        </div>
      </aside>
      <main className="admin-main">{children}</main>
    </div>
  );
}
