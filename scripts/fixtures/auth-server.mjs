// Browser-test preload only. No application code imports this module.
// Intercepts the fixture auth origin; refuses to start against a real auth URL.
if (process.env.NEON_AUTH_BASE_URL !== "https://auth.fixture.invalid/auth") throw new Error("Fixture auth origin required");
const original = globalThis.fetch;
globalThis.fetch = async (input, init) => {
  const url = new URL(input instanceof Request ? input.url : String(input));
  if (url.origin !== "https://auth.fixture.invalid") return original(input, init);
  const headers = new Headers(init?.headers || (input instanceof Request ? input.headers : undefined));
  const cookie = headers.get("cookie") || "";
  if (url.pathname.endsWith("/sign-out")) {
    return Response.json({ success: true }, { headers: {
      "Set-Cookie": "__Secure-neon-auth.session_token=; Max-Age=0; Path=/; HttpOnly; Secure; SameSite=Lax",
    } });
  }
  if (url.pathname.endsWith("/get-session")) {
    if (!cookie.includes("fixture-user") && !cookie.includes("fixture-admin")) return Response.json(null);
    const admin = cookie.includes("fixture-admin");
    const id = admin ? "admin" : "user";
    const timestamp = new Date().toISOString();
    return Response.json({ user: { id, email: `${id}@example.com`, emailVerified: true, name: id, role: "user", createdAt: timestamp, updatedAt: timestamp },
      session: { id: `${id}-session`, userId: id, token: `fixture-${id}`, expiresAt: new Date(Date.now() + 3600000).toISOString(), createdAt: timestamp, updatedAt: timestamp } });
  }
  return Response.json({ message: "Fixture authentication request failed. Please try again." }, { status: 503 });
};
