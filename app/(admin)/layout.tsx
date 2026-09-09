"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type FormEvent, type ReactNode } from "react";

const navLinks = [
  { href: "/admin", label: "Overview", icon: "📊" },
  { href: "/admin/scrape", label: "Scrape & Health", icon: "🕷️" },
  { href: "/admin/ingest", label: "Data Dump", icon: "📁" },
  { href: "/admin/backtest", label: "DGCA Backtest", icon: "🧪" },
];

export default function AdminLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetch("/v1/admin/check", { credentials: "include", cache: "no-store" })
      .then((res) => res.json())
      .then((data: { authenticated?: boolean }) => {
        setIsAuthenticated(Boolean(data.authenticated));
      })
      .catch(() => {
        setIsAuthenticated(false);
      });
  }, []);

  async function handleLogin(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch("/v1/admin/login", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = (await res.json()) as { detail?: string; success?: boolean };
      if (res.ok && data.success) {
        setIsAuthenticated(true);
        setPassword("");
      } else {
        setError(data.detail || "Invalid email or password");
      }
    } catch {
      setError("Network or server error during sign in");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleLogout() {
    try {
      await fetch("/v1/admin/logout", { method: "POST", credentials: "include" });
    } finally {
      setIsAuthenticated(false);
    }
  }

  if (isAuthenticated === null) {
    return (
      <div style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        minHeight: "100vh",
        background: "var(--bg-base)",
        color: "var(--text-secondary)",
        fontFamily: "var(--font-body)"
      }}>
        <div style={{ textAlign: "center" }}>
          <div className="pulse" style={{ display: "inline-block", marginBottom: 12 }} />
          <p>Verifying operator credentials...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        minHeight: "100vh",
        background: "var(--grad-hero)",
        padding: "24px",
        fontFamily: "var(--font-body)",
      }}>
        <div style={{
          width: "100%",
          maxWidth: "420px",
          background: "var(--bg-surface)",
          border: "1px solid var(--border)",
          borderRadius: "var(--radius-lg)",
          padding: "36px 32px",
          boxShadow: "var(--shadow-lg)",
          backdropFilter: "blur(16px)",
        }}>
          <div style={{ textAlign: "center", marginBottom: "28px" }}>
            <div style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              width: "54px",
              height: "54px",
              borderRadius: "14px",
              background: "var(--accent-gold-dim)",
              color: "var(--accent-gold)",
              fontSize: "24px",
              marginBottom: "16px",
              border: "1px solid rgba(232, 165, 75, 0.3)",
            }}>
              🔐
            </div>
            <h1 style={{
              fontFamily: "var(--font-heading)",
              fontSize: "1.5rem",
              fontWeight: 700,
              color: "var(--text-primary)",
              marginBottom: "8px",
            }}>
              Opus<span style={{ color: "var(--accent-gold)" }}>Airs</span> Operator
            </h1>
            <p style={{
              fontSize: "0.875rem",
              color: "var(--text-muted)",
              lineHeight: 1.5,
            }}>
              Restricted operator suite. Email from <code>ADMIN_EMAIL</code> in
              <code>.env</code>.
            </p>
          </div>

          {error && (
            <div style={{
              background: "var(--accent-red-dim)",
              color: "var(--accent-red)",
              border: "1px solid rgba(240, 113, 120, 0.3)",
              borderRadius: "var(--radius-sm)",
              padding: "10px 14px",
              fontSize: "0.85rem",
              marginBottom: "20px",
              display: "flex",
              alignItems: "center",
              gap: "8px",
            }}>
              <span>⚠️</span>
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleLogin} style={{ display: "flex", flexDirection: "column", gap: "18px" }}>
            <div>
              <label style={{
                display: "block",
                fontSize: "0.8rem",
                fontWeight: 600,
                color: "var(--text-secondary)",
                marginBottom: "6px",
                textTransform: "uppercase",
                letterSpacing: "0.05em",
              }}>
                Email
              </label>
              <input
                type="text"
                inputMode="email"
                autoComplete="username"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoFocus
                placeholder="admin@admin"
                style={{
                  width: "100%",
                  padding: "12px 14px",
                  background: "var(--bg-base)",
                  border: "1px solid var(--border)",
                  borderRadius: "var(--radius-sm)",
                  color: "var(--text-primary)",
                  fontSize: "0.95rem",
                  outline: "none",
                  boxSizing: "border-box",
                }}
              />
            </div>

            <div>
              <label style={{
                display: "block",
                fontSize: "0.8rem",
                fontWeight: 600,
                color: "var(--text-secondary)",
                marginBottom: "6px",
                textTransform: "uppercase",
                letterSpacing: "0.05em",
              }}>
                Password
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                placeholder="••••••••••••"
                style={{
                  width: "100%",
                  padding: "12px 14px",
                  background: "var(--bg-base)",
                  border: "1px solid var(--border)",
                  borderRadius: "var(--radius-sm)",
                  color: "var(--text-primary)",
                  fontSize: "0.95rem",
                  outline: "none",
                  boxSizing: "border-box",
                }}
              />
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="btn btn-primary"
              style={{
                width: "100%",
                padding: "12px",
                fontSize: "0.95rem",
                fontWeight: 600,
                cursor: submitting ? "not-allowed" : "pointer",
                opacity: submitting ? 0.7 : 1,
                marginTop: "8px",
              }}
            >
              {submitting ? "Authenticating..." : "Unlock Operator Suite →"}
            </button>
          </form>

          <div style={{ marginTop: "24px", textAlign: "center" }}>
            <Link
              href="/"
              style={{
                fontSize: "0.85rem",
                color: "var(--text-muted)",
                textDecoration: "none",
              }}
            >
              ← Back to public portal
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="admin-shell">
      <aside className="admin-nav">
        <div className="brand">
          Opus<span>Airs</span>
        </div>
        <div className="tag">Operator Panel</div>
        {navLinks.map(({ href, label, icon }) => (
          <Link
            key={href}
            href={href}
            className={pathname === href ? "active" : ""}
          >
            <span className="nav-icon">{icon}</span>
            {label}
          </Link>
        ))}
        <div style={{ marginTop: "auto", display: "flex", flexDirection: "column", gap: "8px", paddingTop: "24px" }}>
          <button
            type="button"
            onClick={handleLogout}
            style={{
              background: "transparent",
              border: "1px solid var(--border)",
              color: "var(--text-secondary)",
              padding: "8px 14px",
              borderRadius: "var(--radius-sm)",
              cursor: "pointer",
              fontSize: "0.85rem",
              display: "flex",
              alignItems: "center",
              gap: "8px",
            }}
          >
            <span>🔒</span> Lock / Sign Out
          </button>
          <div className="back-link" style={{ padding: 0 }}>
            <Link href="/">← Public portal</Link>
          </div>
        </div>
      </aside>
      <main className="admin-main">{children}</main>
    </div>
  );
}
