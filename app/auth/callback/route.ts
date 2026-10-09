import { authConfig, getAuth } from "@/lib/auth/server";
import { oauthCallback } from "@/lib/auth/proxy";
import { authRoute } from "@/lib/auth/errors";
import { loginPath, safeReturnPath } from "@/lib/auth/navigation";

export async function GET(request: Request) {
  const result = await authRoute(request, async () => oauthCallback(request,
    (req, path) => getAuth().handler().GET(req, { params: Promise.resolve({ path }) }), authConfig().cookies.secret));
  if (result.status < 500) return result;
  const url = new URL(request.url);
  return new Response(null, { status: 303, headers: { Location: new URL(loginPath(safeReturnPath(url.searchParams.get("next")), "unavailable"), url.origin).href,
    "Cache-Control": "private, no-store" } });
}
export const runtime = "nodejs";
