"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { signOutAdmin } from "@/app/(entry)/admin/sign-in/actions";

const navLinks = [
  { href: "/admin", label: "Overview", icon: "📊" },
  { href: "/admin/scrape", label: "Scrape & Health", icon: "🕷️" },
  { href: "/admin/ingest", label: "Data Dump", icon: "📁" },
  { href: "/admin/backtest", label: "DGCA Backtest", icon: "🧪" },
];

export default function AdminShell({ email, children }: { email: string; children: ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="admin-shell">
      <aside className="admin-nav">
        <div className="brand">
          Opus<span>Airs</span>
        </div>
        <div className="tag">{email}</div>
        {navLinks.map(({ href, label, icon }) => (
          <Link key={href} href={href} className={pathname === href ? "active" : ""}>
            <span className="nav-icon">{icon}</span>
            {label}
          </Link>
        ))}
        <div style={{ marginTop: "auto", display: "flex", flexDirection: "column", gap: "8px", paddingTop: "24px" }}>
          <form action={signOutAdmin}>
            <button
              type="submit"
              style={{
                background: "transparent",
                border: "1px solid var(--border)",
                color: "var(--text-secondary)",
                padding: "8px 14px",
                borderRadius: "var(--radius-sm)",
                cursor: "pointer",
                fontSize: "0.85rem",
              }}
            >
              Sign out
            </button>
          </form>
          <div className="back-link" style={{ padding: 0 }}>
            <Link href="/">← Public portal</Link>
          </div>
        </div>
      </aside>
      <main className="admin-main">{children}</main>
    </div>
  );
}
