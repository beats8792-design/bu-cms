import { NextResponse, type NextRequest } from "next/server";

/**
 * Route-group gate (Next 16 `proxy`, formerly middleware). Light and cheap:
 * only checks for the presence of a BetterAuth session cookie — it can never
 * authorize, because a cookie can exist without a valid server session.
 * Real authorization lives in server layouts (`appGate`, `requireRolePage`)
 * and in every server action / service (RBAC), per Brain/ARCHITECTURE.md §5.
 *
 * No shared modules here on purpose: proxy may run in an isolated runtime.
 */

const SESSION_COOKIES = [
  "better-auth.session_token",
  "__Secure-better-auth.session_token", // https prod prefix
];

const AUTH_PAGES = new Set(["/login", "/register", "/verify", "/forgot-password", "/reset-password"]);

function hasSessionCookie(request: NextRequest): boolean {
  return SESSION_COOKIES.some((name) => request.cookies.has(name));
}

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  // "/" is the public landing page.
  const isAuthPage = AUTH_PAGES.has(pathname);
  const signedIn = hasSessionCookie(request);

  if (isAuthPage && signedIn) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }
  if (!isAuthPage && pathname !== "/" && !signedIn) {
    const login = new URL("/login", request.url);
    login.searchParams.set("next", pathname);
    return NextResponse.redirect(login);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};
