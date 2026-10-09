import { getAuth, authConfig } from "./auth/server";
import { adminSessionAllowed, cookieValue, hasGoogleSession, NEON_SESSION_TOKEN, type ManagedSession } from "./auth/policy";
import { headers } from "next/headers";
import { cache } from "react";

export { isAdminEmail } from "./auth/policy";
export type AuthUser = { id: string; email: string; role: "user" | "admin"; provider: "google" | "other";
  emailVerified: boolean; name?: string | null; image?: string | null };

const users = new WeakMap<Request, Promise<AuthUser | null>>();
export function getUser(req: Request): Promise<AuthUser | null> {
  let result = users.get(req);
  if (!result) { result = readUser(req); users.set(req, result); }
  return result;
}

async function readUser(req: Request): Promise<AuthUser | null> {
  try {
    if (!cookieValue(req.headers.get("cookie"), NEON_SESSION_TOKEN)) return null;
    const { data, error } = await getAuth().getSession({ query: { disableCookieCache: "true" } });
    if (error || !data?.user || !data.session) return null;
    const session = data as ManagedSession;
    const google = hasGoogleSession(req, session, authConfig().cookies.secret);
    return { id: session.user.id, email: session.user.email.trim().toLowerCase(),
      emailVerified: session.user.emailVerified === true, name: session.user.name, image: session.user.image,
      provider: google ? "google" : "other", role: adminSessionAllowed(session, google) ? "admin" : "user" };
  } catch {
    // Auth outages fail closed. Auth API route returns actionable diagnostics separately.
    return null;
  }
}

export const getCurrentUser = cache(async (): Promise<AuthUser | null> => {
  const requestHeaders = await headers();
  return getUser(new Request("https://opusairs.invalid", { headers: requestHeaders }));
});

export async function requireUser(req: Request): Promise<AuthUser | Response> {
  const user = await getUser(req);
  return user || Response.json({ detail: "Sign in required" }, { status: 401 });
}
export async function requireAdmin(req: Request): Promise<AuthUser | Response> {
  const user = await getUser(req);
  if (!user) return Response.json({ detail: "Sign in with Google required" }, { status: 401 });
  if (user.role !== "admin") return Response.json({ detail: "Admin requires a verified Google sign-in and an allowlisted email" }, { status: 403 });
  return user;
}
export function isAuthResponse(value: AuthUser | Response): value is Response { return value instanceof Response; }
