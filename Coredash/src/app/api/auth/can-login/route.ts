import { NextRequest, NextResponse } from "next/server";
import { findActiveSuperAdminByEmail } from "@/lib/auth/session";
import { NOT_AUTHORIZED } from "@/lib/auth/access";

export const runtime = "nodejs";

/**
 * This route used to answer 403 "Not Authorized" for every failure, including
 * the database being unreachable — and when the query hung instead of failing,
 * it answered nothing at all for the full 120s nginx proxy_read_timeout, so
 * the browser got nginx's HTML 504 and the sign-in page hung forever.
 *
 * Now a refusal and an outage are different answers. Both still fail closed:
 * neither grants a session.
 */
export async function POST(request: NextRequest) {
  let email = "";
  try {
    const body = (await request.json()) as { email?: string };
    email = body.email?.trim().toLowerCase() ?? "";
  } catch {
    return NextResponse.json({ success: false, error: NOT_AUTHORIZED }, { status: 400 });
  }

  if (!email) {
    return NextResponse.json({ success: false, error: NOT_AUTHORIZED }, { status: 403 });
  }

  try {
    const allowed = Boolean(await findActiveSuperAdminByEmail(email));
    if (!allowed) {
      return NextResponse.json({ success: false, error: NOT_AUTHORIZED }, { status: 403 });
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    // Reaching here means the lookup itself failed — timed out, or the pool
    // could not hand out a connection. Telling an admin "Not Authorized" would
    // send them to the denied page to retry forever against a sick backend.
    console.error("[coredash:auth] can-login lookup failed", error);
    return NextResponse.json(
      { success: false, error: "Sign-in is temporarily unavailable. Please try again." },
      { status: 503 }
    );
  }
}
