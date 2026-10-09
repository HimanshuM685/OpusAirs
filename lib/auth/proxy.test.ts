import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { authProxy, oauthCallback } from "./proxy";
import { cookieValue, GOOGLE_PENDING_COOKIE, GOOGLE_SESSION_COOKIE, hasGoogleSession, OAUTH_VERIFIER,
  readProof, signProof, type ManagedSession } from "./policy";

const secret = "test-only-cookie-secret-with-at-least-32-characters";
const origin = "https://app.example";
const session: ManagedSession = { user: { id: "user-google", email: "operator@example.com", emailVerified: true },
  session: { id: "session-google", expiresAt: new Date(Date.now() + 3600000).toISOString() } };
const cookie = (response: Response, name: string) => response.headers.getSetCookie()
  .map((h) => cookieValue(h.split(";")[0], name)).filter(Boolean).at(-1) || null;
function initiation(provider = "google", callbackURL = `${origin}/auth/callback?next=%2Fadmin`) {
  return new Request(`${origin}/api/auth/sign-in/social`, { method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ provider, callbackURL }) });
}
function callback(challenge = "google-challenge", pendingChallenge = challenge) {
  const pending = signProof({ challenge: pendingChallenge, exp: Date.now() + 60000 }, "google-pending", secret);
  return new Request(`${origin}/auth/callback?${OAUTH_VERIFIER}=valid-verifier&next=%2Fadmin`, { headers: {
    cookie: `__Secure-neon-auth.session_challenge=${challenge}; ${GOOGLE_PENDING_COOKIE}=${pending}; __Secure-neon-auth.session_token=old-password-token; __Secure-neon-auth.local.session_data=old-password-cache`,
    authorization: "Bearer old-password-token",
  } });
}
function exchangeResponse() {
  const response = Response.json(session);
  response.headers.append("Set-Cookie", "__Secure-neon-auth.session_token=new-google-token; Path=/; HttpOnly; Secure");
  response.headers.append("Set-Cookie", "__Secure-neon-auth.local.session_data=signed-cache; Path=/; HttpOnly; Secure");
  return response;
}

describe("managed auth proxy", () => {
  it("mints only challenge-bound pending proof, not admin/session proof, on Google initiation", async () => {
    const response = await authProxy(initiation(), ["sign-in", "social"], async () => {
      const upstream = Response.json({ url: "https://accounts.google.com/auth", redirect: true });
      upstream.headers.append("Set-Cookie", "__Secure-neon-auth.session_challenge=google-challenge; Path=/; HttpOnly; Secure");
      return upstream;
    }, secret);
    assert.equal(readProof(cookie(response, GOOGLE_PENDING_COOKIE), "google-pending", secret)?.challenge, "google-challenge");
    assert.equal(cookie(response, GOOGLE_SESSION_COOKIE), null);
  });
  it("rejects alternate social providers and external/incorrect callbacks before forwarding", async () => {
    const forward = async () => { throw new Error("Must not forward invalid sign-in"); };
    for (const request of [initiation("github"), initiation("google", "https://attacker.invalid/auth/callback"), initiation("google", `${origin}/admin`)]) {
      assert.equal((await authProxy(request, ["sign-in", "social"], forward, secret)).status, 400);
    }
  });
  it("does not mint proof when Neon rejects Google initiation or omits its challenge", async () => {
    for (const response of [Response.json({ message: "provider disabled" }, { status: 400 }), Response.json({ url: "https://accounts.google.com" })]) {
      const result = await authProxy(initiation(), ["sign-in", "social"], async () => response, secret);
      assert.equal(cookie(result, GOOGLE_PENDING_COOKIE), null);
    }
  });
  it("clears Google and legacy proofs on successful password sign-in, signup, and logout", async () => {
    for (const path of [["sign-in", "email"], ["sign-up", "email"], ["sign-out"]]) {
      const request = new Request(`${origin}/api/auth/${path.join("/")}`, { method: "POST" });
      const response = await authProxy(request, path, async () => Response.json({ success: true }), secret);
      for (const name of [GOOGLE_PENDING_COOKIE, GOOGLE_SESSION_COOKIE, "opus_session", "opus_admin"]) {
        assert.ok(response.headers.getSetCookie().some((h) => h.startsWith(`${name}=`) && h.includes("Max-Age=0")));
      }
    }
  });
});

describe("Google OAuth completion", () => {
  it("exchanges verifier with cache disabled and no old session credentials, preserves Neon cookies, and binds proof", async () => {
    const response = await oauthCallback(callback(), async (request, path) => {
      assert.deepEqual(path, ["get-session"]);
      assert.equal(new URL(request.url).searchParams.get("disableCookieCache"), "true");
      assert.equal(request.headers.get("cookie"), "__Secure-neon-auth.session_challenge=google-challenge");
      assert.equal(request.headers.get("authorization"), null);
      return exchangeResponse();
    }, secret);
    assert.equal(response.status, 303);
    assert.equal(response.headers.get("location"), `${origin}/admin`);
    assert.equal(cookie(response, "__Secure-neon-auth.session_token"), "new-google-token");
    assert.equal(cookie(response, "__Secure-neon-auth.local.session_data"), "signed-cache");
    const proof = cookie(response, GOOGLE_SESSION_COOKIE);
    assert.ok(proof);
    assert.equal(hasGoogleSession(new Request(`${origin}/admin`, { headers: { cookie: `${GOOGLE_SESSION_COOKIE}=${proof}` } }), session, secret), true);
  });
  it("rejects missing pending proof, mismatched challenge, or missing verifier without exchange", async () => {
    const forward = async () => { throw new Error("Must not exchange invalid callback"); };
    for (const request of [new Request(`${origin}/auth/callback?${OAUTH_VERIFIER}=forged`), callback("new-challenge", "old-challenge"),
      new Request(`${origin}/auth/callback`, { headers: callback().headers })]) {
      const response = await oauthCallback(request, forward, secret);
      const location = new URL(response.headers.get("location")!);
      assert.equal(location.pathname, "/login");
      assert.equal(location.searchParams.get("error"), "oauth");
      assert.equal(cookie(response, GOOGLE_SESSION_COOKIE), null);
    }
  });
  it("rejects failed exchange, a cached-only response, and null session data", async () => {
    for (const response of [Response.json({ message: "invalid verifier" }, { status: 401 }), Response.json(session), Response.json(null)]) {
      const result = await oauthCallback(callback(), async () => response, secret);
      const location = new URL(result.headers.get("location")!);
      assert.equal(location.pathname, "/login");
      assert.equal(location.searchParams.get("next"), "/admin");
      assert.equal(location.searchParams.get("mode"), "admin");
      assert.equal(location.searchParams.get("error"), "oauth");
      assert.equal(cookie(result, GOOGLE_SESSION_COOKIE), null);
    }
  });
  it("does not redirect authenticated users to another origin", async () => {
    const request = new Request(`${origin}/auth/callback?${OAUTH_VERIFIER}=valid&next=${encodeURIComponent("//attacker.invalid")}`, { headers: callback().headers });
    const response = await oauthCallback(request, async () => exchangeResponse(), secret);
    assert.equal(response.headers.get("location"), `${origin}/dashboard`);
  });

  it("completes the flow through the installed Neon SDK proxy and signed-cookie minting", async (t) => {
    const { createNeonAuth } = await import("@neondatabase/auth/next/server");
    const { validateSessionData } = await import("@neondatabase/auth/server");
    const handlers = createNeonAuth({ baseUrl: "https://auth.example/auth", cookies: { secret, sameSite: "lax" }, logLevel: "silent" }).handler();
    const createdAt = new Date().toISOString();
    const managed = { user: { ...session.user, createdAt, updatedAt: createdAt },
      session: { ...session.session, userId: session.user.id, token: "new-google-token", createdAt, updatedAt: createdAt } };
    const calls: string[] = [];
    t.mock.method(globalThis, "fetch", async (input: string | URL | Request, init?: RequestInit) => {
      const url = new URL(input instanceof Request ? input.url : String(input));
      calls.push(url.pathname);
      assert.equal(url.origin, "https://auth.example");
      if (url.pathname === "/auth/sign-in/social") {
        const response = Response.json({ url: "https://accounts.google.com/auth", redirect: true });
        response.headers.append("Set-Cookie", "__Secure-neon-auth.session_challenge=google-challenge; Path=/; HttpOnly; Secure; SameSite=None; Partitioned");
        return response;
      }
      assert.equal(url.pathname, "/auth/get-session");
      const headers = new Headers(init?.headers);
      if (url.searchParams.has(OAUTH_VERIFIER)) {
        assert.equal(url.searchParams.get("disableCookieCache"), "true");
        assert.equal(headers.get("cookie"), "__Secure-neon-auth.session_challenge=google-challenge");
        const response = Response.json(managed);
        response.headers.append("Set-Cookie", "__Secure-neon-auth.session_token=new-google-token; Path=/; HttpOnly; Secure");
        return response;
      }
      // SDK independently fetches the issued session token to sign its local session-data cookie.
      assert.match(headers.get("cookie") || "", /__Secure-neon-auth\.session_token=new-google-token/);
      return Response.json(managed);
    });
    const forward = (request: Request, path: string[]) => handlers[request.method as "GET" | "POST"](request, { params: Promise.resolve({ path }) });
    const started = await authProxy(initiation(), ["sign-in", "social"], forward, secret);
    const pending = cookie(started, GOOGLE_PENDING_COOKIE);
    assert.ok(pending);
    const request = new Request(callback().url, { headers: { cookie: `__Secure-neon-auth.session_challenge=google-challenge; ${GOOGLE_PENDING_COOKIE}=${pending}` } });
    const completed = await oauthCallback(request, forward, secret);
    assert.equal(completed.headers.get("location"), `${origin}/admin`);
    assert.ok(cookie(completed, GOOGLE_SESSION_COOKIE));
    const cache = cookie(completed, "__Secure-neon-auth.local.session_data");
    assert.ok(cache);
    const validated = await validateSessionData(cache, secret);
    assert.equal(validated.valid, true);
    assert.equal(validated.payload?.session?.id, session.session.id);
    assert.equal(cookie(completed, "__Secure-neon-auth.session_token"), "new-google-token");
    assert.ok(calls.filter((path) => path === "/auth/get-session").length >= 2);
  });
});
