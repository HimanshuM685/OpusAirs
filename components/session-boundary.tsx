"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { loginPath } from "@/lib/auth/navigation";
import { clearApiCache } from "@/lib/api";

export function SessionBoundary({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [blocked, setBlocked] = useState(false);
  useEffect(() => {
    let leaving = false;
    const required = (event: Event) => {
      if (leaving) return;
      leaving = true; clearApiCache(); setBlocked(true);
      const status = (event as CustomEvent).detail?.status;
      router.replace(loginPath(window.location.pathname + window.location.search, status === 403 ? "access" : "expired"));
      router.refresh();
    };
    const sync = (event: StorageEvent) => { if (event.key === "opus-signout") required(new Event("session-required")); };
    window.addEventListener("session-required", required);
    window.addEventListener("storage", sync);
    return () => { window.removeEventListener("session-required", required); window.removeEventListener("storage", sync); };
  }, [router]);
  return blocked ? <p className="resource-status" role="status">Returning to sign in…</p> : children;
}
