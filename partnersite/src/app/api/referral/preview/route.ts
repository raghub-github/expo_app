import { NextRequest, NextResponse } from "next/server";
import { fetchBackend } from "@/lib/fetch-backend";

export const dynamic = "force-dynamic";
export const revalidate = 0;

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

  const res = await fetchBackend(
    `/v1/referral/preview?code=${encodeURIComponent(code.trim())}&userType=${encodeURIComponent(userType)}`,
    { timeoutMs: 8_000 },
  );
  if (!res) {
    return NextResponse.json(
      { ok: false, valid: false, error: "unavailable" },
      { status: 502, headers: { "Cache-Control": "no-store" } },
    );
  }
  const body = await res.json().catch(() => ({}));
  return NextResponse.json(body, {
    status: res.status,
    headers: { "Cache-Control": "no-store" },
  });
}
