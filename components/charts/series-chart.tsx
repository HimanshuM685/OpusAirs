"use client";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatChartShortDate, CHART_TOOLTIP_STYLE_COMPACT } from "@/lib/chart-styles";

export default function SeriesChart({ data, x = "period_date", lines = [{ key: "value", label: "APIx", color: "#0b3b2a" }], currency = false, lead = false }: {
  data: object[]; x?: string; lines?: { key: string; label: string; color: string }[]; currency?: boolean; lead?: boolean;
}) {
  const format = (value: number) => new Intl.NumberFormat("en-IN", currency ? { style: "currency", currency: "INR", maximumFractionDigits: 0 } : { maximumFractionDigits: 2 }).format(value);
  return <div className="chart-frame" role="img" aria-label={currency ? "Collected fare trend" : "Airfare index trend"}>
    <ResponsiveContainer width="100%" height="100%" debounce={100}>
      <LineChart data={data} margin={{ top: 12, right: 12, left: 8, bottom: 8 }} accessibilityLayer>
        <CartesianGrid stroke="#d8deda" strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey={x} tickFormatter={lead ? (v) => `T+${v}` : formatChartShortDate} minTickGap={40} tick={{ fontSize: 11 }} />
        <YAxis width={currency ? 78 : 48} tickFormatter={format} tick={{ fontSize: 11 }} domain={currency ? [0, "auto"] : ["auto", "auto"]} />
        <Tooltip contentStyle={CHART_TOOLTIP_STYLE_COMPACT} formatter={(v) => format(Number(v))} />
        {lines.map((line) => <Line key={line.key} dataKey={line.key} name={line.label} stroke={line.color} strokeWidth={2}
          dot={data.length < 8} isAnimationActive={false} />)}
      </LineChart>
    </ResponsiveContainer>
  </div>;
}
