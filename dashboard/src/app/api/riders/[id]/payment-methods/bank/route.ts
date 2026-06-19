/**
 * GET /api/riders/[id]/payment-methods/bank — bank account details for admin verification
 */

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getDb } from "@/lib/db/client";
import { riderPaymentMethods } from "@/lib/db/schema";
import { and, desc, eq, isNull } from "drizzle-orm";
import { hasDashboardAccessByAuth, isSuperAdmin } from "@/lib/permissions/engine";
import {
  decryptRiderAccountNumber,
  maskRiderAccountNumber,
} from "@/lib/rider-bank-account-crypto";

export const runtime = "nodejs";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json(
        { success: false, error: "Not authenticated" },
        { status: 401 },
      );
    }

    const email = user.email ?? "";
    const userIsSuperAdmin = await isSuperAdmin(user.id, email);
    const hasRiderAccess = await hasDashboardAccessByAuth(user.id, email, "RIDER");
    if (!userIsSuperAdmin && !hasRiderAccess) {
      return NextResponse.json(
        { success: false, error: "Insufficient permissions" },
        { status: 403 },
      );
    }

    const { id } = await params;
    const riderId = parseInt(id, 10);
    if (Number.isNaN(riderId)) {
      return NextResponse.json(
        { success: false, error: "Invalid rider ID" },
        { status: 400 },
      );
    }

    const db = getDb();
    const [bankAccount] = await db
      .select()
      .from(riderPaymentMethods)
      .where(
        and(
          eq(riderPaymentMethods.riderId, riderId),
          eq(riderPaymentMethods.methodType, "bank"),
          isNull(riderPaymentMethods.deletedAt),
        ),
      )
      .orderBy(desc(riderPaymentMethods.createdAt))
      .limit(1);

    if (!bankAccount) {
      return NextResponse.json(
        { success: false, error: "No bank account found for this rider" },
        { status: 404 },
      );
    }

    const decrypted = bankAccount.accountNumberEncrypted
      ? decryptRiderAccountNumber(bankAccount.accountNumberEncrypted)
      : null;

    return NextResponse.json({
      success: true,
      data: {
        id: bankAccount.id,
        accountHolderName: bankAccount.accountHolderName,
        bankName: bankAccount.bankName ?? null,
        ifsc: bankAccount.ifsc ?? null,
        branch: bankAccount.branch ?? null,
        accountNumber: decrypted,
        accountNumberMasked: decrypted ? maskRiderAccountNumber(decrypted) : null,
        verificationStatus: bankAccount.verificationStatus,
        verifiedAt: bankAccount.verifiedAt?.toISOString() ?? null,
        createdAt: bankAccount.createdAt.toISOString(),
      },
    });
  } catch (error) {
    console.error("[GET /api/riders/[id]/payment-methods/bank] Error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to load bank account" },
      { status: 500 },
    );
  }
}
