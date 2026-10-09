"use client";
import { useSearchParams } from "next/navigation";
export function useUrlState() {
  const params = useSearchParams();
  function update(values: Record<string, string | null>, push = false) {
    const next = new URL(window.location.href);
    for (const [key, value] of Object.entries(values)) { if (value) next.searchParams.set(key, value); else next.searchParams.delete(key); }
    window.history[push ? "pushState" : "replaceState"](null, "", next.pathname + next.search);
  }
  return { params, update };
}
