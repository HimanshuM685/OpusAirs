"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

const navLinks = [
  { href: "/admin", label: "Overview", icon: "📊" },
  { href: "/admin/scrape", label: "Scrape & Health", icon: "🕷️" },
  { href: "/admin/ingest", label: "Data Dump", icon: "📁" },
  { href: "/admin/backtest", label: "DGCA Backtest", icon: "🧪" },
];

export default function AdminLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();

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
        <div className="back-link">
          <Link href="/">← Back to site</Link>
        </div>
      </aside>
      <main className="admin-main">{children}</main>
    </div>
  );
}
