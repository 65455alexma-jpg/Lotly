import { NextRequest, NextResponse } from "next/server";
import { isValidAuthToken } from "./app/auth";

const publicPaths = [
  "/login",
  "/api/login",
  "/favicon.svg",
  "/og.png",
];

function isPublicPath(pathname: string) {
  return (
    publicPaths.some((path) => pathname === path || pathname.startsWith(`${path}/`)) ||
    pathname.startsWith("/_next/") ||
    pathname.startsWith("/ocr/")
  );
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (isPublicPath(pathname)) {
    if (pathname === "/login" && await isValidAuthToken(request.cookies.get("lotly_session")?.value)) {
      return NextResponse.redirect(new URL("/", request.url));
    }
    return NextResponse.next();
  }

  const isAuthed = await isValidAuthToken(request.cookies.get("lotly_session")?.value);
  if (isAuthed) return NextResponse.next();

  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Please log in to Lotly first." }, { status: 401 });
  }

  return NextResponse.redirect(new URL("/login", request.url));
}

export const config = {
  matcher: ["/((?!.*\\.).*)", "/api/:path*"],
};
