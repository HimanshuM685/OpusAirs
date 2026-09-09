"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { GradientWave } from "@/components/ui/gradient-wave";

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
    await fetch("/v1/auth/logout", { method: "POST", credentials: "include" });
    setMe({ authenticated: false });
  }

  return (
    <div className="user-shell" style={{ position: "relative", minHeight: "100vh" }}>
      <div style={{ position: "fixed", inset: 0, zIndex: 0, opacity: 0.15, pointerEvents: "none" }}>
        <GradientWave colors={["#ffffff", "#0b3b2a", "#ffffff", "#14573f", "#ffffff", "#0b3b2a"]} />
      </div>
      <div style={{ position: "relative", zIndex: 1, display: "flex", flexDirection: "column", minHeight: "100vh" }}>
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
          <Link href="/admin" className="admin-link">
            ⚙ Admin
          </Link>
        </nav>
        <main className="user-main">{children}</main>
      </div>
    </div>
  );
}
