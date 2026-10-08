import { authConfig, getAuth } from "@/lib/auth/server";
import { oauthCallback } from "@/lib/auth/proxy";

export async function GET(request: Request) {
  return oauthCallback(request, (req, path) => getAuth().handler().GET(req, { params: Promise.resolve({ path }) }), authConfig().cookies.secret);
}
export const runtime = "nodejs";
