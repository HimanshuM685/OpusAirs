"use client";

import { createAuthClient } from "@neondatabase/auth/next";

export const authClient = createAuthClient();

export function googleCallback(next = "/search"): string {
  return `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`;
}
