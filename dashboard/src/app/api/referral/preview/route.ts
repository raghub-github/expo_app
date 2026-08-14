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
  const code =
    request.nextUrl.searchParams.get("referralCode") ??
    request.nextUrl.searchParams.get("code") ??
    "";
  const userType = request.nextUrl.searchParams.get("userType") ?? "merchant";
  if (code.trim().length < 3) {
    return NextResponse.json(
      {
        ok: false,
        valid: false,
        error: "invalid_code",
        message: "Invalid referral code. Please check the code and try again.",
      },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }
  const base = backendBase();
  if (!base) {
    return NextResponse.json(
      { ok: false, valid: false, error: "unavailable" },
      { status: 502, headers: { "Cache-Control": "no-store" } },
    );
  }
  try {
    const res = await fetch(
      `${base}/v1/referral/preview?code=${encodeURIComponent(code.trim())}&userType=${encodeURIComponent(userType)}`,
      { cache: "no-store", signal: AbortSignal.timeout(8_000) },
    );
    const body = await res.json().catch(() => ({}));
    return NextResponse.json(body, {
      status: res.status,
      headers: { "Cache-Control": "no-store" },
    });
  } catch {
    return NextResponse.json(
      { ok: false, valid: false, error: "unavailable" },
      { status: 502, headers: { "Cache-Control": "no-store" } },
    );
  }
}
