"use client";

import { createAuthClient } from "@neondatabase/auth/next";
import { safeReturnPath } from "./navigation";

export const authClient = createAuthClient();

export function googleCallback(next = "/search"): string {
  const safe = safeReturnPath(next);
  return `${window.location.origin}/auth/callback?next=${encodeURIComponent(safe)}`;
}
