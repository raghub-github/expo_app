import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function backendBase(): string {
  return (
    process.env.BACKEND_INTERNAL_URL?.trim() ||
    process.env.BACKEND_URL?.trim() ||
    process.env.NEXT_PUBLIC_BACKEND_URL?.trim() ||
    (process.env.NODE_ENV === "development" ? "http://127.0.0.1:3000" : "")
  ).replace(/\/+$/, "");
}

export async function GET(request: NextRequest) {
  const userType = request.nextUrl.searchParams.get("userType") ?? "merchant";
  const fresh = request.nextUrl.searchParams.get("fresh") === "1" ? "&fresh=1" : "";
  const since = request.nextUrl.searchParams.get("sinceVersion");
  const sinceQ = since ? `&sinceVersion=${encodeURIComponent(since)}` : "";
  const base = backendBase();
  if (!base) {
    return NextResponse.json(
      { ok: false, error: "unavailable" },
      { status: 502, headers: { "Cache-Control": "no-store" } },
    );
  }
  try {
    const res = await fetch(
      `${base}/v1/referral/config?userType=${encodeURIComponent(userType)}${fresh}${sinceQ}`,
      { cache: "no-store", signal: AbortSignal.timeout(8_000) },
    );
    // undici/Next Response cannot be constructed with 304 (empty "not modified").
    if (res.status === 304) {
      return NextResponse.json(
        { ok: true, unchanged: true },
        { status: 200, headers: { "Cache-Control": "no-store" } },
      );
    }
    const body = await res.json().catch(() => ({}));
    const status = res.status >= 200 && res.status <= 599 ? res.status : 502;
    return NextResponse.json(body, {
      status,
      headers: { "Cache-Control": "no-store" },
    });
  } catch {
    return NextResponse.json(
      { ok: false, error: "unavailable" },
      { status: 502, headers: { "Cache-Control": "no-store" } },
    );
  }
}
