"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import type { AuthUser } from "@/lib/auth";
import { SignOut } from "./sign-out";
import { SessionBoundary } from "./session-boundary";

const links = [["/dashboard", "Overview"], ["/search", "Price check"], ["/routes", "Routes"], ["/heatmap", "Heatmap"], ["/elasticity", "Booking windows"]];
export function UserShell({ user, children }: { user: AuthUser; children: ReactNode }) {
  const path = usePathname();
  return <div className="workspace">
    <header className="workspace-header"><Link href="/" className="wordmark" translate="no">OpusAirs</Link>
      <div className="workspace-account"><span title={user.email}>{user.email}</span>{user.role === "admin" && <Link href="/admin">Operator</Link>}<SignOut /></div>
      <nav aria-label="Workspace">{links.map(([href, label]) => <Link key={href} href={href} aria-current={path === href || path.startsWith(`${href}/`) ? "page" : undefined}>{label}</Link>)}</nav>
    </header>
    <main id="main-content" className="user-main"><SessionBoundary>{children}</SessionBoundary></main>
  </div>;
}
