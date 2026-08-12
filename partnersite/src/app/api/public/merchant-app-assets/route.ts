import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/** Public read-only proxy for merchant CMS images (no auth). */
export async function GET() {
  const backendBase = (
    process.env.GATIMITRA_BACKEND_API_URL || "http://127.0.0.1:3000"
  ).replace(/\/+$/, "");

  try {
    const res = await fetch(`${backendBase}/v1/app-assets/merchant`, {
      cache: "no-store",
      headers: { "X-Silent-Error": "1" },
    });
    if (!res.ok) {
      return NextResponse.json(
        { error: "upstream_failed", status: res.status },
        { status: 502 }
      );
    }
    const body = await res.json();
    return NextResponse.json(body, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (e) {
    console.error("[GET /api/public/merchant-app-assets]", e);
    return NextResponse.json({ error: "fetch_failed" }, { status: 502 });
  }
}
