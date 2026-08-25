/**
 * POST /api/area-manager/parent-merchant/check-email
 * Check if a parent is already registered with the given email (before sending OTP).
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAreaManagerApiAuth, requireMerchantManager } from "@/lib/area-manager/auth";
import { getSql } from "@/lib/db/client";
import { apiErrorResponse } from "@/lib/api-errors";
import { isValidEmail, normalizeEmail } from "@/lib/valid-email";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const authResult = await requireAreaManagerApiAuth();
    if (authResult.error) return authResult.error;
    const err = requireMerchantManager(authResult.resolved);
    if (err) return err;

    const body = await req.json();
    const email = typeof body?.email === "string" ? normalizeEmail(body.email) : "";
    if (!isValidEmail(email)) {
      return NextResponse.json({ error: "Valid email is required" }, { status: 400 });
    }

    const sql = getSql();
    const rows = await sql`
      SELECT parent_merchant_id FROM merchant_parents
      WHERE LOWER(TRIM(owner_email)) = ${email}
      LIMIT 1
    `;

    const exists = rows.length > 0;
    const parent_merchant_id = exists ? (rows[0] as { parent_merchant_id: string }).parent_merchant_id : undefined;

    return NextResponse.json({ exists, parent_merchant_id });
  } catch (e) {
    console.error("[POST /api/area-manager/parent-merchant/check-email]", e);
    const { body, status } = apiErrorResponse(e);
    return NextResponse.json(body, { status });
  }
}
