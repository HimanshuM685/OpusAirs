"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import type { AuthUser } from "@/lib/auth";
import { SignOut } from "./sign-out";
import { SessionBoundary } from "./session-boundary";

const links = [["/admin", "Overview"], ["/admin/scrape", "Collection"], ["/admin/ingest", "Feed quotes"], ["/admin/backtest", "DGCA backtest"], ["/admin/bulletin", "Bulletin"]];
export function AdminShell({ user, children }: { user: AuthUser; children: ReactNode }) {
  const path = usePathname();
  return <div className="admin-shell"><aside className="admin-nav">
    <Link href="/dashboard" className="wordmark" translate="no">OpusAirs</Link>
    <p className="operator-email">Operator · {user.email}</p>
    <nav aria-label="Operator">{links.map(([href, label]) => <Link key={href} href={href} aria-current={path === href ? "page" : undefined} className={path === href ? "active" : ""}>{label}</Link>)}</nav>
    <div className="admin-nav-footer"><SignOut /><Link href="/dashboard">Back to workspace</Link></div>
  </aside><main id="main-content" className="admin-main"><SessionBoundary>{children}</SessionBoundary></main></div>;
}
