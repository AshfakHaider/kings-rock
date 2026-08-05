import { type NextRequest, NextResponse } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (pathname.startsWith("/api/")) {
    return NextResponse.next();
  }

  const hasEnv = Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );
  const allowDemoMode =
    process.env.NEXT_PUBLIC_ALLOW_DEMO_MODE === "true" ||
    process.env.NODE_ENV !== "production";

  if (!hasEnv) {
    if (!allowDemoMode && !request.nextUrl.pathname.startsWith("/setup-required")) {
      const url = request.nextUrl.clone();
      url.pathname = "/setup-required";
      return NextResponse.redirect(url);
    }
    return NextResponse.next();
  }

  const response = await updateSession(request);
  const isPublicRoute =
    pathname === "/" ||
    pathname.startsWith("/login") ||
    pathname.startsWith("/create-account") ||
    pathname.startsWith("/forgot-password") ||
    pathname.startsWith("/reset-password") ||
    pathname.startsWith("/setup-required");
  const isDashboardRoute = !isPublicRoute;

  if (isDashboardRoute) {
    const authCookie = request.cookies
      .getAll()
      .find((cookie) => cookie.name.includes("auth-token"));
    if (!authCookie) {
      const url = request.nextUrl.clone();
      url.pathname = "/login";
      return NextResponse.redirect(url);
    }
  }

  return response;
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"]
};
