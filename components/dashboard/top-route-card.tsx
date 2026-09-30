"use client";

import { memo } from "react";
import type { RouteOut } from "@/lib/api";
import { cityLabel } from "@/lib/airport-labels";

type Props = {
  route: RouteOut;
};

function TopRouteCardInner({ route: r }: Props) {
  const latest = r.latest_index;
  const prev = r.prev_index;
  const pct =
    latest != null && prev != null && prev !== 0
      ? ((latest - prev) / prev) * 100
      : null;
  const up = pct != null && pct > 0;

  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        padding: "12px 14px",
        background: "#f7faf8",
        border: "1px solid #ebf2ee",
        borderRadius: "10px",
      }}
    >
      <div>
        <div style={{ fontSize: "14px", fontWeight: 700, color: "#0c1212" }}>
          {r.origin} → {r.destination}
        </div>
        <div style={{ fontSize: "12px", color: "#525854" }}>
          {cityLabel(r.origin)} - {cityLabel(r.destination)}
          {latest != null ? ` · ${latest.toFixed(2)}` : ""}
        </div>
      </div>
      <span
        style={{
          fontSize: "13px",
          fontWeight: 700,
          color: pct == null ? "#525854" : up ? "#d9383a" : "#0b3b2a",
          background:
            pct == null
              ? "rgba(124,129,123,0.12)"
              : up
                ? "rgba(217, 56, 58, 0.1)"
                : "rgba(11, 59, 42, 0.1)",
          padding: "4px 8px",
          borderRadius: "6px",
        }}
      >
        {pct == null ? "—" : `${up ? "+" : ""}${pct.toFixed(1)}%`}
      </span>
    </div>
  );
}

const TopRouteCard = memo(TopRouteCardInner);
export default TopRouteCard;
