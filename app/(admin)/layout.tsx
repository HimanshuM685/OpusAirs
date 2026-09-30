"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type FormEvent, type ReactNode } from "react";

const navLinks = [
  { href: "/admin", label: "Overview" },
  { href: "/admin/scrape", label: "Scrape & Health" },
  { href: "/admin/ingest", label: "Data Dump" },
  { href: "/admin/backtest", label: "DGCA Backtest" },
  { href: "/admin/bulletin", label: "Bulletin" },
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
      .then((data: { authenticated?: boolean }) => setIsAuthenticated(Boolean(data.authenticated)))
      .catch(() => setIsAuthenticated(false));
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
    await fetch("/v1/admin/logout", { method: "POST", credentials: "include" });
    setIsAuthenticated(false);
  }

  if (isAuthenticated === null) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <p>Checking operator session…</p>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
        <form onSubmit={handleLogin} className="panel" style={{ width: "100%", maxWidth: 420 }}>
          <h1 style={{ marginTop: 0 }}>Operator sign in</h1>
          <p className="sub">Uses ADMIN_EMAIL and ADMIN_PASSWORD from the environment. No default password.</p>
          {error && <p className="err">{error}</p>}
          <div className="field">
            <label htmlFor="admin-email">Email</label>
            <input id="admin-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus />
          </div>
          <div className="field">
            <label htmlFor="admin-password">Password</label>
            <input id="admin-password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          </div>
          <button className="primary" type="submit" disabled={submitting}>
            {submitting ? "Signing in…" : "Sign in"}
          </button>
          <p style={{ marginTop: 16 }}>
            <Link href="/">← Public portal</Link>
          </p>
        </form>
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
        {navLinks.map(({ href, label }) => (
          <Link key={href} href={href} className={pathname === href ? "active" : ""}>
            {label}
          </Link>
        ))}
        <div style={{ marginTop: "auto", paddingTop: 24 }}>
          <button type="button" onClick={() => void handleLogout()}>
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
