import { NextRequest, NextResponse } from "next/server";
import { createAuthToken, isCorrectPassword, isPasswordProtectionEnabled } from "../../auth";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  if (!isPasswordProtectionEnabled()) {
    return NextResponse.json({ error: "Password protection is not configured yet." }, { status: 500 });
  }

  const input = (await request.json()) as Record<string, unknown>;
  const password = String(input.password ?? "");

  if (!isCorrectPassword(password)) {
    return NextResponse.json({ error: "That password is not right." }, { status: 401 });
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set("lotly_session", await createAuthToken(), {
    httpOnly: true,
    sameSite: "lax",
    secure: true,
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
  return response;
}
