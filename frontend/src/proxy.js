import { NextResponse } from "next/server";

// Server-side auth redirects. The JWT is mirrored into the `sb_token` cookie
// by lib/api.js#setToken, so protected routes redirect before any HTML is
// sent instead of flashing an empty page and bouncing on the client.
// RequireAuth (client) remains as the second line of defence -- the cookie
// can outlive a token that the API has since rejected.
//
// Routes: "/" is the public landing page (with sign-in); "/boards" and below
// are the app. A signed-in visitor hitting "/" goes straight to their boards.

const PUBLIC_PATHS = ["/", "/login"];

export function proxy(request) {
  const { pathname, searchParams } = request.nextUrl;
  const hasToken = Boolean(request.cookies.get("sb_token")?.value);
  const isPublic = PUBLIC_PATHS.includes(pathname) || pathname.startsWith("/status/");

  if (!hasToken && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    url.search = "";
    url.hash = "signin";
    return NextResponse.redirect(url);
  }

  // Signed in and on the landing page (not an OAuth callback) → the app.
  // (Status pages are public for everyone, signed in or not.)
  if (hasToken && PUBLIC_PATHS.includes(pathname) && !searchParams.has("token")) {
    const url = request.nextUrl.clone();
    url.pathname = "/boards";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  // Everything except Next internals and static files.
  matcher: ["/((?!_next/|favicon\.svg|.*\.(?:png|jpg|svg|ico|css|js|map)$).*)"],
};
