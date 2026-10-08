export function authConfig(env: Record<string, string | undefined> = process.env) {
  const baseUrl = env.NEON_AUTH_BASE_URL;
  const secret = env.NEON_AUTH_COOKIE_SECRET;
  let validUrl = false;
  try {
    const url = new URL(baseUrl || "");
    validUrl = url.protocol === "https:" && !url.username && !url.password && !url.search && !url.hash;
  } catch { /* Invalid or missing configuration fails closed. */ }
  if (!baseUrl || !validUrl) throw new Error("NEON_AUTH_BASE_URL must be your HTTPS Neon Auth URL");
  if (!secret || secret.length < 32) throw new Error("NEON_AUTH_COOKIE_SECRET must contain at least 32 characters");
  return { baseUrl, cookies: { secret, sameSite: "lax" as const } };
}
