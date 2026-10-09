import { CHALLENGE_COOKIES, challengeValue, clearProofs, cookieValue, GOOGLE_PENDING_COOKIE, GOOGLE_SESSION_COOKIE,
  NEON_SESSION_TOKEN, OAUTH_VERIFIER, proofCookie, readProof, safeReturnPath, signProof, type ManagedSession } from "./policy";
import { loginPath } from "./navigation";

type Forward = (request: Request, path: string[]) => Promise<Response>;

export async function authProxy(request: Request, path: string[], forward: Forward, secret: string): Promise<Response> {
  const endpoint = path.join("/");
  let google = false;
  let next = "/dashboard";
  if (request.method === "POST" && endpoint === "sign-in/social") {
    let body: { provider?: string; callbackURL?: string };
    try { body = await request.clone().json(); } catch { return Response.json({ message: "Invalid sign-in request" }, { status: 400 }); }
    if (!body || body.provider !== "google") return Response.json({ message: "Google is the supported social sign-in provider" }, { status: 400 });
    try {
      const callback = new URL(body.callbackURL || "", request.url);
      if (callback.origin !== new URL(request.url).origin || callback.pathname !== "/auth/callback") throw new Error("Invalid callback");
      next = safeReturnPath(callback.searchParams.get("next"));
    } catch { return Response.json({ message: "Use the same-origin /auth/callback URL" }, { status: 400 }); }
    google = true;
  }
  const response = await forward(request, path);
  response.headers.set("Cache-Control", "private, no-store");
  // Only a successful Google initiation can mint the challenge-bound pending proof.
  if (google && response.ok) {
    const challenge = response.headers.getSetCookie().map((h) => challengeValue(h.split(";")[0])).find(Boolean);
    if (challenge) response.headers.append("Set-Cookie", proofCookie(GOOGLE_PENDING_COOKIE,
      signProof({ challenge, next, exp: Date.now() + 10 * 60000 }, "google-pending", secret), 600));
  }
  if (endpoint === "sign-out" || (response.ok && (endpoint === "sign-in/email" || endpoint === "sign-up/email"))) clearProofs(response);
  return response;
}

export async function oauthCallback(request: Request, forward: Forward, secret: string): Promise<Response> {
  const url = new URL(request.url);
  const pending = readProof(cookieValue(request.headers.get("cookie"), GOOGLE_PENDING_COOKIE), "google-pending", secret);
  const challenge = challengeValue(request.headers.get("cookie"));
  const next = safeReturnPath(typeof pending?.next === "string" ? pending.next : url.searchParams.get("next"));
  const failed = () => {
    const response = new Response(null, { status: 303, headers: { Location: new URL(loginPath(next, "oauth"), url.origin).href, "Cache-Control": "private, no-store" } });
    response.headers.append("Set-Cookie", proofCookie(GOOGLE_PENDING_COOKIE, "", 0));
    return response;
  };
  if (!url.searchParams.get(OAUTH_VERIFIER) || !challenge || pending?.challenge !== challenge) {
    return failed();
  }
  // Neon verifies its own challenge + verifier. Never infer provider from linked accounts or client input.
  // An existing password session must not short-circuit the OAuth exchange via SDK cache.
  url.searchParams.set("disableCookieCache", "true");
  const headers = new Headers(request.headers);
  // Only the OAuth challenge may authenticate this exchange, never an old session token.
  headers.set("cookie", CHALLENGE_COOKIES.flatMap((name) => {
    const value = cookieValue(request.headers.get("cookie"), name);
    return value ? [`${name}=${encodeURIComponent(value)}`] : [];
  }).join("; "));
  headers.delete("authorization");
  let exchanged: Response;
  try { exchanged = await forward(new Request(url, { method: "GET", headers }), ["get-session"]); }
  catch { return failed(); }
  let session: ManagedSession | null = null;
  if (exchanged.ok) {
    try { session = await exchanged.clone().json() as ManagedSession; } catch { /* fail closed */ }
  }
  const token = exchanged.headers.getSetCookie().map((h) => cookieValue(h.split(";")[0], NEON_SESSION_TOKEN)).find(Boolean);
  const valid = Boolean(token && session?.user?.id && session?.session?.id && Date.parse(String(session.session.expiresAt)) > Date.now());
  const destination = valid ? next : loginPath(next, "oauth");
  const response = new Response(null, { status: 303, headers: { Location: new URL(destination, url.origin).href, "Cache-Control": "no-store" } });
  for (const cookie of exchanged.headers.getSetCookie()) response.headers.append("Set-Cookie", cookie);
  clearProofs(response);
  if (valid && session) {
    const exp = Date.parse(String(session.session.expiresAt));
    response.headers.append("Set-Cookie", proofCookie(GOOGLE_SESSION_COOKIE,
      signProof({ sessionId: session.session.id, userId: session.user.id, exp }, "google-session", secret), Math.max(1, Math.floor((exp - Date.now()) / 1000))));
  }
  return response;
}
