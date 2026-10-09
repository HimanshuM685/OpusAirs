import { NextResponse, type NextRequest } from "next/server";

// This header only carries the return destination. It never grants access.
// Overwrite caller-supplied values; authorization remains in server layouts/APIs.
export function proxy(request: NextRequest) {
  const headers = new Headers(request.headers);
  headers.set("x-opus-return-path", request.nextUrl.pathname + request.nextUrl.search);
  return NextResponse.next({ request: { headers } });
}

export const config = {
  matcher: ["/dashboard/:path*", "/search/:path*", "/routes/:path*", "/heatmap/:path*", "/elasticity/:path*", "/admin/:path*"],
};
