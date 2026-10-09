import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import { POST } from "../../app/api/auth/[...path]/route";
import { GET as callback } from "../../app/auth/callback/route";
import { authRoute } from "./errors";

const request = () => new Request("https://app.example/api/auth/sign-in/social", {
  method: "POST", headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ provider: "google", callbackURL: "https://app.example/auth/callback?next=%2Fadmin" }),
});
const context = () => ({ params: Promise.resolve({ path: ["sign-in", "social"] }) });

describe("production auth route failures", () => {
  let originalUrl: string | undefined;
  let originalSecret: string | undefined;
  beforeEach(() => {
    originalUrl = process.env.NEON_AUTH_BASE_URL;
    originalSecret = process.env.NEON_AUTH_COOKIE_SECRET;
    delete process.env.NEON_AUTH_BASE_URL;
    delete process.env.NEON_AUTH_COOKIE_SECRET;
  });
  afterEach(() => {
    if (originalUrl === undefined) delete process.env.NEON_AUTH_BASE_URL; else process.env.NEON_AUTH_BASE_URL = originalUrl;
    if (originalSecret === undefined) delete process.env.NEON_AUTH_COOKIE_SECRET; else process.env.NEON_AUTH_COOKIE_SECRET = originalSecret;
  });

  it("returns actionable JSON for missing Production URL instead of an empty 500", async (t) => {
    const log = t.mock.method(console, "error", () => {});
    t.mock.method(globalThis, "fetch", async () => { throw new Error("Must not contact Neon without configuration"); });
    const response = await POST(request(), context());
    assert.equal(response.status, 503);
    assert.equal(response.headers.get("cache-control"), "no-store");
    const body = await response.json();
    assert.equal(body.code, "AUTH_NOT_CONFIGURED");
    assert.equal(body.variable, "NEON_AUTH_BASE_URL");
    assert.equal(body.problem, "missing");
    assert.match(body.message, /Production environment variables.*redeploy/);
    assert.equal(log.mock.callCount(), 1);
  });

  it("identifies a missing dedicated cookie secret before starting Google OAuth", async (t) => {
    t.mock.method(console, "error", () => {});
    process.env.NEON_AUTH_BASE_URL = "https://auth.example/auth";
    const response = await POST(request(), context());
    assert.equal(response.status, 503);
    const body = await response.json();
    assert.equal(body.variable, "NEON_AUTH_COOKIE_SECRET");
    assert.equal(body.problem, "missing");
  });

  it("never includes invalid URL or short secret values in diagnostic responses/logs", async (t) => {
    const log = t.mock.method(console, "error", () => {});
    for (const env of [{ url: "https://user:private-password@auth.example/auth", secret: "private-short-secret" },
      { url: "https://auth.example/auth", secret: "private-short-secret" }]) {
      process.env.NEON_AUTH_BASE_URL = env.url;
      process.env.NEON_AUTH_COOKIE_SECRET = env.secret;
      const response = await POST(request(), context());
      assert.equal(response.status, 503);
      const text = await response.text();
      assert.ok(!text.includes("private-password") && !text.includes(env.secret));
    }
    const logs = JSON.stringify(log.mock.calls.map((call) => call.arguments));
    assert.ok(!logs.includes("private-password") && !logs.includes("private-short-secret"));
  });

  it("returns a failed OAuth callback to the staged login screen without exposing a JSON dead end", async (t) => {
    t.mock.method(console, "error", () => {});
    const response = await callback(new Request("https://app.example/auth/callback?neon_auth_session_verifier=test&next=%2Fadmin%2Fingest"));
    assert.equal(response.status, 303);
    const url = new URL(response.headers.get("location")!);
    assert.equal(url.pathname, "/login");
    assert.equal(url.searchParams.get("error"), "unavailable");
    assert.equal(url.searchParams.get("next"), "/admin/ingest");
    assert.equal(url.searchParams.get("mode"), "admin");
  });

  it("logs unexpected synchronous and async failures but keeps private details out of the response", async (t) => {
    const log = t.mock.method(console, "error", () => {});
    for (const handle of [() => { throw new Error("private upstream details"); }, async () => { throw new Error("private upstream details"); }]) {
      const response = await authRoute(request(), handle);
      assert.equal(response.status, 500);
      const text = await response.text();
      assert.match(text, /AUTH_INTERNAL_ERROR/);
      assert.ok(!text.includes("private upstream details"));
    }
    assert.equal(log.mock.callCount(), 2);
  });
});
