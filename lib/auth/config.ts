type AuthVariable = "NEON_AUTH_BASE_URL" | "NEON_AUTH_COOKIE_SECRET";
type ConfigProblem = "missing" | "invalid" | "too_short";

export class AuthConfigurationError extends Error {
  readonly code = "AUTH_NOT_CONFIGURED";

  constructor(readonly variable: AuthVariable, readonly problem: ConfigProblem) {
    const message = problem === "missing"
      ? `Set ${variable} in Vercel Production environment variables, then redeploy.`
      : variable === "NEON_AUTH_BASE_URL"
        ? "NEON_AUTH_BASE_URL must be your HTTPS Neon Auth URL, without credentials, query parameters, or a fragment."
        : "NEON_AUTH_COOKIE_SECRET must contain at least 32 characters. Update the Production environment variable, then redeploy.";
    super(message);
    this.name = "AuthConfigurationError";
  }
}

export function authConfig(env: Record<string, string | undefined> = process.env) {
  const baseUrl = env.NEON_AUTH_BASE_URL?.trim().replace(/\/+$/, "");
  const secret = env.NEON_AUTH_COOKIE_SECRET;
  if (!baseUrl) throw new AuthConfigurationError("NEON_AUTH_BASE_URL", "missing");
  let validUrl = false;
  try {
    const url = new URL(baseUrl || "");
    validUrl = url.protocol === "https:" && !url.username && !url.password && !url.search && !url.hash;
  } catch { /* Invalid or missing configuration fails closed. */ }
  if (!validUrl) throw new AuthConfigurationError("NEON_AUTH_BASE_URL", "invalid");
  if (!secret) throw new AuthConfigurationError("NEON_AUTH_COOKIE_SECRET", "missing");
  if (secret.length < 32) throw new AuthConfigurationError("NEON_AUTH_COOKIE_SECRET", "too_short");
  return { baseUrl, cookies: { secret, sameSite: "lax" as const } };
}
