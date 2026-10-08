import { authConfig, getAuth } from "@/lib/auth/server";
import { oauthCallback } from "@/lib/auth/proxy";
import { authRoute } from "@/lib/auth/errors";

export async function GET(request: Request) {
  return authRoute(request, async () => oauthCallback(request,
    (req, path) => getAuth().handler().GET(req, { params: Promise.resolve({ path }) }), authConfig().cookies.secret));
}
export const runtime = "nodejs";
