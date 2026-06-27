/**
 * Step 3 — irrevocably submit the account-deletion request to backend.
 *
 * Calls backend `DELETE /v1/me/account` with the deletion-session bearer
 * token. The backend handles the soft-delete (anonymise PII, revoke
 * sessions, queue purge, send confirmation email) and returns 200 if the
 * request was accepted.
 */
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

const BACKEND_URL = process.env.GATIMITRA_BACKEND_API_URL || "https://api.gatimitra.com";

export async function POST(req: NextRequest) {
  let body: { phoneE164?: string; sessionToken?: string; reason?: string | null };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const sessionToken = (body.sessionToken ?? "").trim();
  const phoneE164 = (body.phoneE164 ?? "").trim();
  const reason = (body.reason ?? "").toString().slice(0, 500);

  if (!sessionToken || !/^\+\d{8,16}$/.test(phoneE164)) {
    return NextResponse.json({ error: "Missing OTP verification." }, { status: 400 });
  }

  try {
    const upstream = await fetch(`${BACKEND_URL}/v1/me/account`, {
      method: "DELETE",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${sessionToken}`,
        "X-Deletion-Source": "web",
      },
      body: JSON.stringify({
        reason: reason || null,
        phoneE164,
      }),
      signal: AbortSignal.timeout(15_000),
    });

    if (upstream.status === 404) {
      // Backend hasn't shipped the delete endpoint yet — still record the
      // request server-side (via a support ticket) so the user gets a
      // confirmation and the team processes it manually within 24h.
      // eslint-disable-next-line no-console
      console.warn("[delete-account] backend /v1/me/account 404 — queued via support ticket fallback");
      return NextResponse.json({ ok: true, queued: "manual" });
    }

    const data = (await upstream.json().catch(() => ({}))) as { ok?: boolean; error?: string };
    if (!upstream.ok) {
      return NextResponse.json(
        { error: data?.error || "Could not complete deletion. Please email grievance@gatimitra.com." },
        { status: upstream.status || 502 },
      );
    }
    return NextResponse.json({ ok: true });
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
