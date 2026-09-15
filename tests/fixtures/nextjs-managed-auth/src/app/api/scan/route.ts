import { rateLimit } from "@/lib/rateLimit";

export async function POST(request) {
  const result = rateLimit(request.headers.get("x-forwarded-for") ?? "anon", 10, 60000);
  if (!result.allowed) {
    return Response.json({ error: "Too many requests." }, { status: 429, headers: { "Retry-After": "60" } });
  }
  return Response.json({ ok: true });
}
