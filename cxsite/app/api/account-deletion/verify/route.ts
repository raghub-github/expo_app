/**
 * Step 2 — verify the OTP and mint a short-lived deletion-session token.
 *
 * Calls backend /v1/auth/otp/verify with appType=customer. The backend issues
 * a normal customer Session (accessToken + refreshToken). We DON'T persist
 * that session in a cookie — instead we hand the accessToken back to the
 * browser scoped to this single deletion flow. The next step
 * POST /api/account-deletion uses the accessToken as a Bearer for the
 * eventual /v1/me/delete-account call.
 */
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

const BACKEND_URL = process.env.GATIMITRA_BACKEND_API_URL || "https://api.gatimitra.com";

export async function POST(req: NextRequest) {
  let body: { requestId?: string; phoneE164?: string; otp?: string };
  try {
    body = (await req.json()) as { requestId?: string; phoneE164?: string; otp?: string };
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const requestId = (body.requestId ?? "").trim();
  const phoneE164 = (body.phoneE164 ?? "").trim();
  const otp = (body.otp ?? "").replace(/\D/g, "");

  if (!requestId || !/^\+\d{8,16}$/.test(phoneE164) || otp.length !== 6) {
    return NextResponse.json({ error: "Invalid OTP request." }, { status: 400 });
  }

  // The deletion flow is a one-off — we generate a synthetic deviceId so the
  // backend can record the source ("web-delete-account") in audit logs.
  const deviceId = `web-delete-${Date.now().toString(36)}`;

  try {
    const upstream = await fetch(`${BACKEND_URL}/v1/auth/otp/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        requestId,
        phoneE164,
        otp,
        deviceId,
        appType: "customer",
      }),
      signal: AbortSignal.timeout(10_000),
    });
    const data = (await upstream.json().catch(() => ({}))) as {
      accessToken?: string;
      error?: string;
      message?: string;
    };
    if (!upstream.ok || !data.accessToken) {
      return NextResponse.json(
        { error: data?.message || data?.error || "OTP did not match." },
        { status: upstream.status || 400 },
      );
    }
    return NextResponse.json({ sessionToken: data.accessToken });
  } catch (err) {
    return NextResponse.json(
      {
        error:
          err instanceof Error && err.name === "AbortError"
            ? "Request timed out. Please try again."
            : "Could not reach our servers. Please try again.",
      },
      { status: 502 },
    );
  }
}
