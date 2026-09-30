import type { CSSProperties } from "react";

/** Stable Recharts tooltip props — avoid new object each render. */
export const CHART_TOOLTIP_STYLE: CSSProperties = {
  background: "#ffffff",
  border: "1px solid #d8deda",
  borderRadius: 10,
  fontSize: 13,
  color: "#0c1212",
  boxShadow: "0 4px 12px rgba(11,59,42,0.12)",
};

export const CHART_TOOLTIP_STYLE_COMPACT: CSSProperties = {
  ...CHART_TOOLTIP_STYLE,
  borderRadius: 8,
  boxShadow: "0 4px 12px rgba(11,59,42,0.1)",
};

export function formatChartShortDate(d: string): string {
  return String(d).slice(5, 10).replace("-", "/");
}

export function formatInrAxis(v: number): string {
  return `₹${Number(v).toLocaleString("en-IN")}`;
}
