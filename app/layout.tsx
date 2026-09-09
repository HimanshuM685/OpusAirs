import type { ReactNode } from "react";
import "./globals.css";

export const metadata = {
  title: "OpusAirs — Real-time Airfare Price Index",
  description:
    "High-frequency airfare collection and daily Airfare Price Index (APIx) for NSO / RBI. SIH 2026.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
