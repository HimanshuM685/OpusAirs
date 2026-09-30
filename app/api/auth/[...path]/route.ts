import { getNeonAuth } from "@/lib/auth/server";

const neon = getNeonAuth();

function unconfigured(): Response {
  return Response.json({ detail: "Admin auth is not configured" }, { status: 503 });
}

export const GET = neon ? neon.handler().GET : unconfigured;
export const POST = neon ? neon.handler().POST : unconfigured;
