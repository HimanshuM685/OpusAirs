import Link from "next/link";
import type { ReactNode } from "react";

export type JellyAnimatedHeroProps = { badgeText?: string; title?: ReactNode; subtitle?: string; primaryCtaText?: string; primaryCtaHref?: string; secondaryCtaText?: string; secondaryCtaHref?: string; children?: ReactNode };

// Compatibility for existing imports: operational headings have no pointer-driven
// React updates or continuously animated decorative layers.
export default function JellyAnimatedHero({ title, subtitle, primaryCtaText, primaryCtaHref = "/dashboard", secondaryCtaText, secondaryCtaHref = "/search", children }: JellyAnimatedHeroProps) {
  return <header className="page-heading"><div><h1>{title || "Airfare price index"}</h1>{subtitle && <p>{subtitle}</p>}{children}</div>
    <div className="row">{primaryCtaText && <Link className="btn primary" href={primaryCtaHref}>{primaryCtaText}</Link>}{secondaryCtaText && <Link className="text-link" href={secondaryCtaHref}>{secondaryCtaText}</Link>}</div></header>;
}
