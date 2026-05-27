import { auth } from "./auth";
import { NextResponse } from "next/server";

/**
 * Route protection:
 *   /admin/*   → role === "admin"
 *   /app/*     → any authenticated user
 *   /login, /  → public
 *   everything else → public (API routes do their own auth)
 *
 * Note: middleware runs at the edge, so we use the session token via Auth.js's
 * `auth` helper (which reads the JWT cookie — no DB hit per request).
 */
export default auth((req) => {
  const { nextUrl, auth: session } = req;
  const path = nextUrl.pathname;

  const isAdminArea = path.startsWith("/admin");
  const isAppArea = path.startsWith("/app");
  const isAuthPage = path === "/login" || path === "/signup";

  // If already signed in and they hit /login, bounce them to their home.
  if (isAuthPage && session?.user) {
    const url = nextUrl.clone();
    url.pathname = session.user.role === "admin" ? "/admin" : "/app";
    return NextResponse.redirect(url);
  }

  if (!session?.user && (isAdminArea || isAppArea)) {
    const url = nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", path);
    return NextResponse.redirect(url);
  }

  if (isAdminArea && session?.user.role !== "admin") {
    const url = nextUrl.clone();
    url.pathname = "/app";
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
});

export const config = {
  // Skip middleware on static assets and the Auth.js endpoints themselves.
  matcher: ["/((?!api/auth|_next/static|_next/image|favicon.ico).*)"],
};
