/**
 * Step 1 of the web account-deletion flow — request an OTP.
 *
 * Proxies to the existing backend OTP infra used by the customer app:
 *   POST https://api.gatimitra.com/v1/auth/otp/request
 *
 * Why proxy: keeps the SUPABASE_SEND_SMS_HOOK_SECRET, MSG91 keys and other
 * server secrets out of the browser. The backend already rate-limits this
 * endpoint and writes a server-side OTP record we read back in /verify.
 */
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

const BACKEND_URL = process.env.GATIMITRA_BACKEND_API_URL || "https://api.gatimitra.com";

export async function POST(req: NextRequest) {
  let body: { phoneE164?: string };
  try {
    body = (await req.json()) as { phoneE164?: string };
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const phoneE164 = (body.phoneE164 ?? "").trim();
  if (!/^\+\d{8,16}$/.test(phoneE164)) {
    return NextResponse.json({ error: "Enter a valid mobile number." }, { status: 400 });
  }

  try {
    const upstream = await fetch(`${BACKEND_URL}/v1/auth/otp/request`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phoneE164 }),
      // Don't follow redirects, time out fast — if backend is down, the user
      // should see a clear error rather than a hanging UI.
      signal: AbortSignal.timeout(10_000),
    });
    const data = (await upstream.json().catch(() => ({}))) as {
      requestId?: string;
      message?: string;
      error?: string;
    };
    if (!upstream.ok || !data.requestId) {
      return NextResponse.json(
        {
          error:
            data?.message ||
            data?.error ||
            "We could not send the OTP. Please try again or contact support.",
        },
        { status: upstream.status || 502 },
      );
    }
    return NextResponse.json({ requestId: data.requestId });
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
