import { NextRequest, NextResponse } from "next/server";
import { findActiveSuperAdminByEmail } from "@/lib/auth/session";
import { NOT_AUTHORIZED } from "@/lib/auth/access";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as { email?: string };
    const email = body.email?.trim().toLowerCase() ?? "";
    const allowed = Boolean(email && (await findActiveSuperAdminByEmail(email)));
    if (!allowed) {
      return NextResponse.json({ success: false, error: NOT_AUTHORIZED }, { status: 403 });
    }
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ success: false, error: NOT_AUTHORIZED }, { status: 403 });
  }
}
