"use client";

import { memo } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  CHART_TOOLTIP_STYLE,
  formatChartShortDate,
} from "@/lib/chart-styles";

type Point = { date: string; value: number };

type Props = {
  data: Point[];
};

function IndexAreaChartInner({ data }: Props) {
  const showDots = data.length < 8;

  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="emeraldGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#0b3b2a" stopOpacity={0.25} />
            <stop offset="95%" stopColor="#0b3b2a" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke="#e1ebe5" strokeDasharray="3 3" />
        <XAxis
          dataKey="date"
          stroke="#7c817b"
          tick={{ fontSize: 12, fill: "#525854" }}
          tickFormatter={formatChartShortDate}
          minTickGap={24}
        />
        <YAxis
          stroke="#7c817b"
          domain={["auto", "auto"]}
          tick={{ fontSize: 12, fill: "#525854" }}
          width={48}
        />
        <Tooltip
          contentStyle={CHART_TOOLTIP_STYLE}
          labelFormatter={(d) => String(d)}
        />
        <Area
          type="monotone"
          dataKey="value"
          stroke="#0b3b2a"
          fill="url(#emeraldGrad)"
          strokeWidth={2.5}
          dot={showDots}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

const IndexAreaChart = memo(IndexAreaChartInner);
export default IndexAreaChart;
