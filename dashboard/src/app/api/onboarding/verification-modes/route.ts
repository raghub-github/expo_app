/**
 * GET /api/onboarding/verification-modes
 *
 * Same Policy Center modes as partnersite register-store, for AM child onboarding
 * and any dashboard merchant document flow.
 */
import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedApiUser, authFailureResponse } from "@/lib/auth/api-session";
import { getSql } from "@/lib/db/client";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    const auth = await getAuthenticatedApiUser(request);
    if (!auth.ok) return authFailureResponse(auth);

    const sql = getSql();
    const rows = (await sql`
      SELECT document_kind::text AS document_kind, mode::text AS mode
        FROM public.verification_policies
       WHERE subject_type = 'merchant_store'
         AND effective_to IS NULL
    `) as unknown as Array<{ document_kind: string; mode: string }>;

    const modes: Record<string, string> = {};
    for (const row of rows ?? []) {
      modes[String(row.document_kind)] = String(row.mode);
    }
    // Alias so partnersite + AM resolve the same Policy Center row.
    if (modes.aadhaar_digilocker && !modes.aadhaar) {
      modes.aadhaar = modes.aadhaar_digilocker;
    }
    if (modes.aadhaar && !modes.aadhaar_digilocker) {
      modes.aadhaar_digilocker = modes.aadhaar;
    }
    if (modes.upi_penny_drop && !modes.upi) {
      modes.upi = modes.upi_penny_drop;
    }
    if (modes.bank_account && !modes.bank) {
      modes.bank = modes.bank_account;
    }
    return NextResponse.json({ success: true, modes });
  } catch (e) {
    console.warn("[verification-modes] error:", e);
    return NextResponse.json({ success: true, modes: {} });
  }
}
