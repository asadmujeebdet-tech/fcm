import { NextResponse, type NextRequest } from "next/server";
import { AUTH_COOKIE, isValidAuthToken } from "@/lib/auth";

export const runtime = "nodejs";

const PUBLIC_PATHS = ["/login", "/api/auth/login"];

export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  const isPublic = PUBLIC_PATHS.some(
    (path) => pathname === path || pathname.startsWith(`${path}/`)
  );

  if (isPublic) return NextResponse.next();

  const token = request.cookies.get(AUTH_COOKIE)?.value;
  if (isValidAuthToken(token)) return NextResponse.next();

  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const loginUrl = new URL("/login", request.url);
  loginUrl.searchParams.set("next", pathname);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};
