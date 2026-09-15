import { NextResponse } from "next/server";

const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS ?? "").split(",").filter(Boolean);

export function proxy(request) {
  const origin = request.headers.get("origin");
  if (origin && ALLOWED_ORIGINS.length > 0 && !ALLOWED_ORIGINS.includes(origin)) {
    return NextResponse.json({ error: "Origin not allowed." }, { status: 403 });
  }

  const response = NextResponse.next();
  response.headers.set("Content-Security-Policy", "default-src 'self'");
  response.headers.set("Strict-Transport-Security", "max-age=63072000");
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("X-Frame-Options", "DENY");
  return response;
}
