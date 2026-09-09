"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

const navLinks = [
  ["/dashboard", "Dashboard"],
  ["/search", "Search"],
  ["/routes", "Routes"],
  ["/heatmap", "Heatmap"],
  ["/elasticity", "Elasticity"],
];

export default function UserLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="user-shell">
      <nav className="topnav">
        <Link href="/" className="brand">
          Opus<span>Airs</span>
        </Link>
        <div className="topnav-links">
          {navLinks.map(([href, label]) => (
            <Link
              key={href}
              href={href}
              className={pathname === href ? "active" : ""}
            >
              {label}
            </Link>
          ))}
        </div>
      </nav>
      <main className="user-main">{children}</main>
    </div>
  );
}
