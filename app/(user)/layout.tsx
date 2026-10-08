"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { GradientWave } from "@/components/ui/gradient-wave";
import { authClient } from "@/lib/auth/client";

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
  const [logoutError, setLogoutError] = useState<string | null>(null);

  function loadMe() {
    fetch("/v1/auth/me", { credentials: "include", cache: "no-store" })
      .then((r) => r.json())
      .then((data: Me) => setMe(data))
      .catch(() => setMe({ authenticated: false }));
  }

  useEffect(() => {
    loadMe();
    window.addEventListener("auth-changed", loadMe);
    return () => window.removeEventListener("auth-changed", loadMe);
  }, [pathname]);

  async function logout() {
    setLogoutError(null);
    try {
      const result = await authClient.signOut();
      if (result.error) throw new Error(result.error.message || "Sign out failed.");
    } catch (err) {
      setLogoutError(err instanceof Error ? err.message : "Sign out failed.");
      return;
    }
    setMe({ authenticated: false });
    window.dispatchEvent(new Event("auth-changed"));
  }

  return (
    <div className="user-shell" style={{ position: "relative", minHeight: "100vh" }}>
      <div style={{ position: "fixed", inset: 0, zIndex: 0, opacity: 0.15, pointerEvents: "none" }}>
        <GradientWave colors={["#ffffff", "#0b3b2a", "#ffffff", "#14573f", "#ffffff", "#0b3b2a"]} />
      </div>
      <div style={{ position: "relative", zIndex: 1, display: "flex", flexDirection: "column", minHeight: "100vh" }}>
        <header className="topnav-container">
          <nav className="floating-pill-nav">
            <Link href="/" className="brand-glyph" title="OpusAirs Home">
              ❖
            </Link>

            <div className="floating-pill-links">
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

            <div className="floating-pill-actions" style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              {me?.authenticated && me.user ? (
                <>
                  <span
                    className="topnav-email"
                    title={me.user.email}
                    style={{ fontSize: "12px", color: "var(--text-secondary)", maxWidth: "160px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                  >
                    {me.user.email}
                  </span>
                  <button
                    type="button"
                    onClick={() => void logout()}
                    style={{
                      background: "transparent",
                      border: "1px solid var(--border)",
                      color: "var(--text-secondary)",
                      borderRadius: "6px",
                      padding: "5px 10px",
                      fontSize: "12px",
                      fontWeight: 600,
                      cursor: "pointer",
                      fontFamily: "inherit",
                    }}
                  >
                    Sign out
                  </button>
                </>
              ) : (
                <>
                  <Link
                    href="/login"
                    style={{
                      color: "var(--text-primary)",
                      padding: "6px 12px",
                      borderRadius: "6px",
                      fontSize: "13px",
                      fontWeight: 600,
                      textDecoration: "none",
                    }}
                  >
                    Login
                  </Link>
                  <Link
                    href="/register"
                    className="nav-btn-solid"
                    style={{
                      padding: "6px 14px",
                      borderRadius: "6px",
                      fontSize: "13px",
                      fontWeight: 600,
                      textDecoration: "none",
                    }}
                  >
                    Register
                  </Link>
                </>
              )}
            </div>
          </nav>
        </header>
        {logoutError && <p className="auth-error" role="alert">{logoutError}</p>}

        <main className="user-main">{children}</main>
      </div>
    </div>
  );
}
