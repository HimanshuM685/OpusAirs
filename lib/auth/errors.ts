import { AuthConfigurationError } from "./config";

export async function authRoute(request: Request, handle: () => Promise<Response>): Promise<Response> {
  try {
    return await handle();
  } catch (error) {
    const path = new URL(request.url).pathname;
    if (error instanceof AuthConfigurationError) {
      // Only config key/problem are logged or returned, never environment values.
      console.error("[auth] Configuration error", { path, code: error.code, variable: error.variable, problem: error.problem });
      return Response.json({ code: error.code, message: error.message, variable: error.variable, problem: error.problem },
        { status: 503, headers: { "Cache-Control": "no-store" } });
    }
    console.error("[auth] Unexpected route failure", { path, error });
    return Response.json({ code: "AUTH_INTERNAL_ERROR", message: "Authentication failed unexpectedly. Check this request's Vercel Runtime Logs." },
      { status: 500, headers: { "Cache-Control": "no-store" } });
  }
}
