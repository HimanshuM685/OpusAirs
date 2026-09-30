import { NextResponse, type NextRequest } from "next/server";
import { getNeonAuth, neonAuthConfigured } from "@/lib/auth/server";

export async function middleware(request: NextRequest) {
  if (request.nextUrl.pathname === "/admin/sign-in") return NextResponse.next();
  if (!neonAuthConfigured()) {
    const url = request.nextUrl.clone();
    url.pathname = "/admin/sign-in";
    url.searchParams.set("error", "unconfigured");
    return NextResponse.redirect(url);
  }
  return getNeonAuth()!.middleware({ loginUrl: "/admin/sign-in" })(request);
}

export const config = {
  matcher: ["/admin", "/admin/:path*"],
};
