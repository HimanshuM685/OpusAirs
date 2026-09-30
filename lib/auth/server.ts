import { createNeonAuth, type NeonAuth } from "@neondatabase/auth/next/server";

let cached: NeonAuth | null = null;

export function neonAuthConfigured(): boolean {
  const base = process.env.NEON_AUTH_BASE_URL?.trim();
  const secret = process.env.NEON_AUTH_COOKIE_SECRET?.trim();
  return Boolean(base && secret && secret.length >= 32);
}

export function getNeonAuth(): NeonAuth | null {
  if (!neonAuthConfigured()) return null;
  if (!cached) {
    cached = createNeonAuth({
      baseUrl: process.env.NEON_AUTH_BASE_URL!.trim(),
      cookies: { secret: process.env.NEON_AUTH_COOKIE_SECRET!.trim() },
    });
  }
  return cached;
}
