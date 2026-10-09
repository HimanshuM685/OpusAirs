import { createHmac, timingSafeEqual } from "node:crypto";
import { NEON_AUTH_COOKIE_PREFIX, NEON_AUTH_SESSION_CHALLENGE_COOKIE_NAME, NEON_AUTH_SESSION_COOKIE_NAME } from "@neondatabase/auth/server";

export const GOOGLE_SESSION_COOKIE = "opus_google_session";
export const GOOGLE_PENDING_COOKIE = "opus_google_pending";
export const NEON_SESSION_TOKEN = NEON_AUTH_SESSION_COOKIE_NAME;
export const CHALLENGE_COOKIES = [NEON_AUTH_SESSION_CHALLENGE_COOKIE_NAME, `${NEON_AUTH_COOKIE_PREFIX}.session_challange`] as const;
export const OAUTH_VERIFIER = "neon_auth_session_verifier";

export type ManagedSession = {
  user: { id: string; email: string; emailVerified?: boolean; name?: string | null; image?: string | null; role?: string };
  session: { id: string; expiresAt: string | Date };
};

export function adminEmails(raw = process.env.ADMIN_EMAILS || ""): string[] {
  return raw.split(",").map((e) => e.trim().toLowerCase()).filter(Boolean);
}
export function isAdminEmail(email?: string | null): boolean {
  return Boolean(email && adminEmails().includes(email.trim().toLowerCase()));
}
export function cookieValue(header: string | null, name: string): string | null {
  for (const pair of (header || "").split(";")) {
    const index = pair.indexOf("=");
    if (index < 1) continue;
    if (pair.slice(0, index).trim() !== name) continue;
    try { return decodeURIComponent(pair.slice(index + 1).trim()); } catch { return null; }
  }
  return null;
}
export function challengeValue(header: string | null): string | null {
  return cookieValue(header, CHALLENGE_COOKIES[0]) || cookieValue(header, CHALLENGE_COOKIES[1]);
}
export function signProof(value: Record<string, unknown>, purpose: "google-pending" | "google-session", secret: string): string {
  const payload = Buffer.from(JSON.stringify(value)).toString("base64url");
  const signature = createHmac("sha256", secret).update(`${purpose}:${payload}`).digest("base64url");
  return `${payload}.${signature}`;
}
export function readProof(value: string | null, purpose: "google-pending" | "google-session", secret: string, now = Date.now()): Record<string, unknown> | null {
  if (!value || value.length > 4096) return null;
  const parts = value.split(".");
  if (parts.length !== 2) return null;
  const expected = createHmac("sha256", secret).update(`${purpose}:${parts[0]}`).digest("base64url");
  const actualBytes = Buffer.from(parts[1]);
  const expectedBytes = Buffer.from(expected);
  if (actualBytes.length !== expectedBytes.length || !timingSafeEqual(actualBytes, expectedBytes)) return null;
  try {
    const data = JSON.parse(Buffer.from(parts[0], "base64url").toString()) as Record<string, unknown>;
    return typeof data.exp === "number" && Number.isFinite(data.exp) && data.exp > now ? data : null;
  } catch { return null; }
}
export function hasGoogleSession(req: Request, session: ManagedSession, secret: string, now = Date.now()): boolean {
  const proof = readProof(cookieValue(req.headers.get("cookie"), GOOGLE_SESSION_COOKIE), "google-session", secret, now);
  return Boolean(proof && proof.sessionId === session.session.id && proof.userId === session.user.id
    && Date.parse(String(session.session.expiresAt)) > now);
}
export function adminSessionAllowed(session: ManagedSession, google: boolean): boolean {
  return google && session.user.emailVerified === true && isAdminEmail(session.user.email);
}
export function proofCookie(name: string, value: string, maxAge: number): string {
  return `${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${process.env.NODE_ENV === "production" ? "; Secure" : ""}`;
}
export function clearProofs(response: Response): void {
  for (const name of [GOOGLE_SESSION_COOKIE, GOOGLE_PENDING_COOKIE, "opus_session", "opus_admin"]) {
    response.headers.append("Set-Cookie", proofCookie(name, "", 0));
  }
}
export { safeReturnPath } from "./navigation";
