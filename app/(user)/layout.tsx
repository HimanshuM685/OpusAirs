"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";

const navLinks = [
  ["/dashboard", "Dashboard"],
  ["/search", "Search"],
  ["/routes", "Routes"],
  ["/heatmap", "Heatmap"],
  ["/elasticity", "Elasticity"],
];

type Me = { authenticated: boolean; user?: { email: string; role: string } };

export default function UserLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [me, setMe] = useState<Me | null>(null);

  function loadMe() {
    fetch("/v1/auth/me")
      .then((r) => r.json())
      .then((data: Me) => setMe(data))
      .catch(() => setMe({ authenticated: false }));
  }

  useEffect(() => {
    loadMe();
  }, [pathname]);

  async function logout() {
    await fetch("/v1/auth/logout", { method: "POST" });
    setMe({ authenticated: false });
  }

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
        <div className="topnav-user">
          {me?.authenticated && me.user ? (
            <>
              <span className="topnav-email">{me.user.email}</span>
              {me.user.role === "admin" && (
                <Link href="/admin" className="admin-link">
                  Admin
                </Link>
              )}
              <button type="button" className="admin-link" onClick={() => void logout()}>
                Logout
              </button>
            </>
          ) : (
            <>
              <Link href="/login" className={pathname === "/login" ? "active" : ""}>
                Login
              </Link>
              <Link href="/register" className="admin-link">
                Register
              </Link>
            </>
          )}
        </div>
      </nav>
      <main className="user-main">{children}</main>
    </div>
  );
}
