import Link from "next/link";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata = {
  title: "OpusAirs APIx",
  description: "Real-time Airfare Price Index for India (SIH26056)",
};

const links = [
  ["/", "APIx"],
  ["/heatmap", "Sector heatmap"],
  ["/elasticity", "Lead-time elasticity"],
  ["/routes", "Routes"],
  ["/ingest", "Feed quotes"],
  ["/health", "Collection health"],
  ["/backtest", "DGCA backtest"],
];

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <div className="shell">
          <aside className="nav">
            <div className="brand">Opus<span>Airs</span></div>
            <div className="tag">Airfare Price Index · MoSPI / NSO</div>
            {links.map(([href, label]) => (
              <Link key={href} href={href}>
                {label}
              </Link>
            ))}
          </aside>
          <main className="main">{children}</main>
        </div>
      </body>
    </html>
  );
}
