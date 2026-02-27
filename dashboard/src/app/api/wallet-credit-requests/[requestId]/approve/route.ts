/**
 * POST /api/wallet-credit-requests/[requestId]/approve
 * Approve a pending wallet credit request. Writes to wallet_ledger and updates rider_wallet (FIFO/block sync).
 * Requires APPROVE on RIDER_WALLET_CREDITS.
 */

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getDb } from "@/lib/db/client";
import {
  walletCreditRequests,
  riderWallet,
  walletLedger,
  riderNegativeWalletBlocks,
} from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import {
  getSystemUserIdFromAuthUser,
  hasDashboardAccess,
  hasAccessPointAction,
  isSuperAdmin,
} from "@/lib/permissions/engine";
import { getSystemUserByEmail } from "@/lib/db/operations/users";
import { logActionByAuth } from "@/lib/audit/logger";
import { applyFifoAllocation, GLOBAL_BLOCK_THRESHOLD } from "@/lib/rider-negative-wallet-blocks";

export const runtime = "nodejs";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ requestId: string }> }
) {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return NextResponse.json({ success: false, error: "Not authenticated" }, { status: 401 });
    }

    const systemUserId = await getSystemUserIdFromAuthUser(user.id, user.email ?? undefined);
    if (!systemUserId) {
      return NextResponse.json({ success: false, error: "User not found" }, { status: 403 });
    }

    const canApprove =
      (await isSuperAdmin(user.id, user.email ?? "")) ||
      ((await hasDashboardAccess(systemUserId, "RIDER")) &&
        (await hasAccessPointAction(systemUserId, "RIDER", "RIDER_WALLET_CREDITS", "APPROVE")));
    if (!canApprove) {
      return NextResponse.json({
        success: false,
        error: "Insufficient permissions. APPROVE on RIDER_WALLET_CREDITS required.",
      }, { status: 403 });
    }

    const { requestId } = await params;
    const id = parseInt(requestId);
    if (isNaN(id)) {
      return NextResponse.json({ success: false, error: "Invalid request ID" }, { status: 400 });
    }

    let body: { reviewNote?: string };
    try {
      body = await request.json().catch(() => ({}));
    } catch {
      body = {};
    }
    const reviewNote = typeof body.reviewNote === "string" ? body.reviewNote.trim() || null : null;

    const db = getDb();
    const systemUser = await getSystemUserByEmail(user.email!);
    const reviewedByEmail = systemUser?.email ?? user.email ?? null;

    await db.transaction(async (tx) => {
      const [row] = await tx
        .select()
        .from(walletCreditRequests)
        .where(eq(walletCreditRequests.id, id))
        .for("update")
        .limit(1);

      if (!row) {
        throw new Error("REQUEST_NOT_FOUND");
      }
      if (row.status !== "pending") {
        throw new Error("REQUEST_NOT_PENDING");
      }

      const riderId = row.riderId;
      const amount = Number(row.amount);
      const ref = `credit_req_${row.id}`;

      let [wallet] = await tx.select().from(riderWallet).where(eq(riderWallet.riderId, riderId)).limit(1);
      if (!wallet) {
        await tx.insert(riderWallet).values({
          riderId,
          totalBalance: "0",
          earningsFood: "0",
          earningsParcel: "0",
          earningsPersonRide: "0",
          penaltiesFood: "0",
          penaltiesParcel: "0",
          penaltiesPersonRide: "0",
          totalWithdrawn: "0",
        });
        [wallet] = await tx.select().from(riderWallet).where(eq(riderWallet.riderId, riderId)).limit(1);
      }

      const currentBalance = wallet ? Number(wallet.totalBalance) : 0;
      const balanceAfter = (currentBalance + amount).toFixed(2);

      await tx.insert(walletLedger).values({
        riderId,
        entryType: "manual_add",
        amount: amount.toFixed(2),
        balance: balanceAfter,
        serviceType: row.serviceType && ["food", "parcel", "person_ride"].includes(row.serviceType) ? row.serviceType : null,
        ref,
        refType: "wallet_credit_request",
        description: row.reason,
        metadata: {
          requestId: row.id,
          orderId: row.orderId ?? undefined,
          serviceType: row.serviceType ?? undefined,
          approvedFrom: "pending-actions",
        },
        performedByType: "agent",
        performedById: systemUserId,
      });

      await tx
        .update(riderWallet)
        .set({
          totalBalance: balanceAfter,
          lastUpdatedAt: new Date(),
        })
        .where(eq(riderWallet.riderId, riderId));

      await tx
        .update(walletCreditRequests)
        .set({
          status: "approved",
          reviewedBySystemUserId: systemUserId,
          reviewedByEmail,
          reviewedAt: new Date(),
          reviewNote,
          approvedLedgerRef: ref,
        })
        .where(eq(walletCreditRequests.id, id));
    });

    const [updated] = await db
      .select()
      .from(walletCreditRequests)
      .where(eq(walletCreditRequests.id, id))
      .limit(1);
    if (!updated) {
      return NextResponse.json({ success: false, error: "Request not found" }, { status: 404 });
    }

    // FIFO and block sync run after transaction (they read/write rider_wallet and blocks)
    await applyFifoAllocation(updated.riderId, Number(updated.amount));

    await logActionByAuth(
      user.id,
      user.email!,
      "RIDER",
      "REQUEST_APPROVE",
      {
        resourceType: "wallet_credit_request",
        resourceId: String(id),
        actionDetails: { requestId: id, reviewNote },
        newValues: { status: "approved" },
      }
    );

    const [walletAfter] = await db
      .select()
      .from(riderWallet)
      .where(eq(riderWallet.riderId, updated.riderId))
      .limit(1);
    const blocksAfter = await db
      .select({ serviceType: riderNegativeWalletBlocks.serviceType, reason: riderNegativeWalletBlocks.reason })
      .from(riderNegativeWalletBlocks)
      .where(eq(riderNegativeWalletBlocks.riderId, updated.riderId));
    const totalBalanceAfter = walletAfter ? Number(walletAfter.totalBalance) : 0;

    return NextResponse.json({
      success: true,
      data: {
        id: updated.id,
        status: updated.status,
        approvedLedgerRef: updated.approvedLedgerRef ?? undefined,
        riderId: updated.riderId,
        amount: Number(updated.amount),
        totalBalanceAfter,
        globalWalletBlock: totalBalanceAfter <= GLOBAL_BLOCK_THRESHOLD,
        negativeWalletBlocks: blocksAfter.map((b) => ({ serviceType: b.serviceType, reason: b.reason })),
      },
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    if (msg === "REQUEST_NOT_FOUND") {
      return NextResponse.json({ success: false, error: "Request not found" }, { status: 404 });
    }
    if (msg === "REQUEST_NOT_PENDING") {
      return NextResponse.json({ success: false, error: "Request is not pending" }, { status: 400 });
    }
    console.error("[POST /api/wallet-credit-requests/[requestId]/approve] Error:", error);
    return NextResponse.json(
      { success: false, error: msg === "Unknown error" ? "Failed to approve" : msg },
      { status: 500 }
    );
  }
}
