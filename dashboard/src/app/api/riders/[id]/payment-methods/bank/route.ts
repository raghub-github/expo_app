/**
 * GET /api/riders/[id]/payment-methods/bank — latest bank (verify sheet)
 * GET ?list=all — all non-deleted payout accounts for the rider
 */

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getDb } from "@/lib/db/client";
import { riderPaymentMethods, riders } from "@/lib/db/schema";
import { and, desc, eq, isNull } from "drizzle-orm";
import { hasDashboardAccessByAuth, isSuperAdmin } from "@/lib/permissions/engine";
import {
  decryptRiderAccountNumber,
  maskRiderAccountNumber,
} from "@/lib/rider-bank-account-crypto";

export const runtime = "nodejs";

function mapBankRow(
  bankAccount: typeof riderPaymentMethods.$inferSelect,
  opts?: { riderName?: string | null },
) {
  const decrypted = bankAccount.accountNumberEncrypted
    ? decryptRiderAccountNumber(bankAccount.accountNumberEncrypted)
    : null;

  const crossMessages = Array.isArray(bankAccount.crossCheckMessages)
    ? bankAccount.crossCheckMessages.map(String)
    : [];

  let pendingReason =
    bankAccount.verificationStatus === "pending"
      ? bankAccount.pendingReason?.trim() || null
      : null;

  // Legacy pending rows (before pending_reason column): explain from names.
  if (
    bankAccount.verificationStatus === "pending" &&
    !pendingReason &&
    opts?.riderName?.trim()
  ) {
    const holder = bankAccount.accountHolderName.trim().toLowerCase();
    const rider = opts.riderName.trim().toLowerCase();
    if (holder && rider && holder !== rider) {
      pendingReason = [
        "Bank details were provider-verified (Cashfree). Pending manual review because account holder name does not match rider/Aadhaar name.",
        `Account holder: ${bankAccount.accountHolderName}. Rider: ${opts.riderName.trim()}.`,
      ].join(" ");
    } else {
      pendingReason = "Awaiting manual verification by GatiMitra Team.";
    }
  }

  return {
    id: bankAccount.id,
    accountHolderName: bankAccount.accountHolderName,
    bankName: bankAccount.bankName ?? null,
    ifsc: bankAccount.ifsc ?? null,
    branch: bankAccount.branch ?? null,
    accountNumber: decrypted,
    accountNumberMasked: decrypted ? maskRiderAccountNumber(decrypted) : null,
    verificationStatus: bankAccount.verificationStatus,
    verifiedAt: bankAccount.verifiedAt?.toISOString() ?? null,
    rejectionReason: bankAccount.rejectionReason ?? null,
    pendingReason,
    crossCheckStatus: bankAccount.crossCheckStatus ?? null,
    crossCheckMessages: crossMessages,
    isActive: bankAccount.isActive !== false,
    isPrimary: bankAccount.isPrimary === true,
    createdAt: bankAccount.createdAt.toISOString(),
  };
}

export async function GET(
  request: NextRequest,
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

    const listAll = request.nextUrl.searchParams.get("list") === "all";
    const db = getDb();

    const [riderRow] = await db
      .select({ name: riders.name })
      .from(riders)
      .where(eq(riders.id, riderId))
      .limit(1);

    if (listAll) {
      const rows = await db
        .select()
        .from(riderPaymentMethods)
        .where(
          and(
            eq(riderPaymentMethods.riderId, riderId),
            eq(riderPaymentMethods.methodType, "bank"),
            isNull(riderPaymentMethods.deletedAt),
          ),
        )
        .orderBy(desc(riderPaymentMethods.isPrimary), desc(riderPaymentMethods.createdAt));

      return NextResponse.json({
        success: true,
        data: {
          accounts: rows.map((row) =>
            mapBankRow(row, { riderName: riderRow?.name ?? null }),
          ),
        },
      });
    }

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

    return NextResponse.json({
      success: true,
      data: mapBankRow(bankAccount, { riderName: riderRow?.name ?? null }),
    });
  } catch (error) {
    console.error("[GET /api/riders/[id]/payment-methods/bank] Error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to load bank account" },
      { status: 500 },
    );
  }
}
