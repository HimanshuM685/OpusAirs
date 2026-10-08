import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import { authConfig } from "./config";
import { adminSessionAllowed, GOOGLE_SESSION_COOKIE, hasGoogleSession, readProof, safeReturnPath,
  signProof, type ManagedSession } from "./policy";

const secret = "test-only-cookie-secret-with-at-least-32-characters";
const now = Date.parse("2026-10-08T12:00:00Z");
const session: ManagedSession = {
  user: { id: "user-google", email: "Operator@Example.com", emailVerified: true, role: "admin" },
  session: { id: "session-google", expiresAt: new Date(now + 3600000).toISOString() },
};

describe("admin authorization", () => {
  let original: string | undefined;
  beforeEach(() => { original = process.env.ADMIN_EMAILS; process.env.ADMIN_EMAILS = " operator@example.com , other@example.com "; });
  afterEach(() => { if (original === undefined) delete process.env.ADMIN_EMAILS; else process.env.ADMIN_EMAILS = original; });

  it("allows a verified Google session with an exact, case-insensitive allowlist match", () => {
    assert.equal(adminSessionAllowed(session, true), true);
  });
  it("rejects an allowlisted password session even with a Neon admin role", () => {
    assert.equal(adminSessionAllowed(session, false), false);
  });
  it("rejects nonallowlisted and unverified Google accounts", () => {
    assert.equal(adminSessionAllowed({ ...session, user: { ...session.user, email: "outsider@example.com" } }, true), false);
    assert.equal(adminSessionAllowed({ ...session, user: { ...session.user, emailVerified: false } }, true), false);
    assert.equal(adminSessionAllowed({ ...session, user: { ...session.user, email: "operator@example.com.attacker.invalid" } }, true), false);
  });
  it("denies all admins when the allowlist is empty", () => {
    process.env.ADMIN_EMAILS = "";
    assert.equal(adminSessionAllowed(session, true), false);
  });
});

describe("Google session proof", () => {
  const proof = signProof({ sessionId: session.session.id, userId: session.user.id, exp: now + 60000 }, "google-session", secret);
  const request = (value: string) => new Request("https://app.example/admin", { headers: { cookie: `${GOOGLE_SESSION_COOKIE}=${value}` } });

  it("binds proof to both the managed session and user", () => {
    assert.equal(hasGoogleSession(request(proof), session, secret, now), true);
    assert.equal(hasGoogleSession(request(proof), { ...session, session: { ...session.session, id: "password-session" } }, secret, now), false);
    assert.equal(hasGoogleSession(request(proof), { ...session, user: { ...session.user, id: "other-user" } }, secret, now), false);
  });
  it("rejects forged, wrong-secret, wrong-purpose, expired, and revoked/expired-session proofs", () => {
    assert.equal(hasGoogleSession(request(`${proof.slice(0, -1)}!`), session, secret, now), false);
    assert.equal(hasGoogleSession(request(`${proof.split(".")[0]}.${"é".repeat(43)}`), session, secret, now), false);
    assert.equal(hasGoogleSession(request(proof), session, "another-secret", now), false);
    assert.equal(readProof(proof, "google-pending", secret, now), null);
    assert.equal(hasGoogleSession(request(proof), session, secret, now + 60000), false);
    assert.equal(hasGoogleSession(request(proof), { ...session, session: { ...session.session, expiresAt: new Date(now - 1).toISOString() } }, secret, now), false);
  });
  it("never accepts legacy opus_session or opus_admin cookies as Google proof", () => {
    const legacy = new Request("https://app.example/admin", { headers: { cookie: "opus_session=1.signature; opus_admin=admin.signature" } });
    assert.equal(hasGoogleSession(legacy, session, secret, now), false);
  });
});

describe("auth configuration and redirects", () => {
  it("requires explicit HTTPS Neon URL and a dedicated long secret", () => {
    assert.throws(() => authConfig({}), /NEON_AUTH_BASE_URL/);
    assert.throws(() => authConfig({ NEON_AUTH_BASE_URL: "http://auth.example/auth", NEON_AUTH_COOKIE_SECRET: secret }), /HTTPS/);
    assert.throws(() => authConfig({ NEON_AUTH_BASE_URL: "https://auth.example/auth", SESSION_SECRET: secret }), /NEON_AUTH_COOKIE_SECRET/);
    assert.throws(() => authConfig({ NEON_AUTH_BASE_URL: "https://auth.example/auth", NEON_AUTH_COOKIE_SECRET: "short" }), /32 characters/);
    assert.equal(authConfig({ NEON_AUTH_BASE_URL: "https://auth.example/auth", NEON_AUTH_COOKIE_SECRET: secret }).cookies.secret, secret);
  });
  it("normalizes pasted Auth URL whitespace and trailing slashes before constructing upstream endpoints", () => {
    assert.equal(authConfig({ NEON_AUTH_BASE_URL: " https://auth.example/auth/ \n", NEON_AUTH_COOKIE_SECRET: secret }).baseUrl, "https://auth.example/auth");
  });
  it("preserves local return paths and blocks external or recursive auth redirects", () => {
    assert.equal(safeReturnPath("/admin/ingest?tab=csv"), "/admin/ingest?tab=csv");
    for (const path of [null, "https://attacker.invalid", "//attacker.invalid", "/\\attacker.invalid", "/api/auth/sign-out", "/auth/callback", "/../api/auth/get-session", "/search\r\nLocation: evil"]) {
      assert.equal(safeReturnPath(path), "/search", String(path));
    }
  });
});
