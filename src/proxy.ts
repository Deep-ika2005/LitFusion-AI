import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";

export default auth((req) => {
  const isLoggedIn = !!req.auth;
  const { pathname } = req.nextUrl;

  const isAuthPage = pathname === "/login";
  const isProtected = ["/saved", "/compare"].some((p) => pathname.startsWith(p));

  if (isAuthPage && isLoggedIn) {
    return NextResponse.redirect(new URL("/search", req.nextUrl.origin));
  }

  if (isProtected && !isLoggedIn) {
    const loginUrl = new URL("/login", req.nextUrl.origin);
    loginUrl.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
});

export const config = {
  matcher: ["/saved/:path*", "/compare/:path*", "/login"],
};