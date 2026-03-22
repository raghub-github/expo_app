/**
 * POST /api/riders/[id]/wallet/add-balance
 * Add generic credit (manual_add, no service_type). App updates wallet, runs FIFO allocation, then sync.
 * Ledger trigger skips generic manual_add so this route is the single source of truth.
 */

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getDb } from "@/lib/db/client";
import { riders, riderWallet, walletLedger, riderNegativeWalletBlocks } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { hasDashboardAccessByAuth, isSuperAdmin } from "@/lib/permissions/engine";
import { canPerformRiderActionAnyService } from "@/lib/permissions/actions";
import { getSystemUserByEmail } from "@/lib/db/operations/users";
import { logActionByAuth } from "@/lib/audit/logger";
import { applyFifoAllocation, GLOBAL_BLOCK_THRESHOLD } from "@/lib/rider-negative-wallet-blocks";

export const runtime = "nodejs";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return NextResponse.json({ success: false, error: "Not authenticated" }, { status: 401 });
    }

    const userIsSuperAdmin = await isSuperAdmin(user.id, user.email ?? "");
    const hasRiderAccess = await hasDashboardAccessByAuth(user.id, user.email ?? "", "RIDER");
    const canAddBalance =
      userIsSuperAdmin ||
      (hasRiderAccess && (await canPerformRiderActionAnyService(user.id, user.email ?? "", "UPDATE")));
    if (!canAddBalance) {
      return NextResponse.json(
        { success: false, error: "Insufficient permissions. Rider action (penalty/refund) access required to add balance directly." },
        { status: 403 }
      );
    }

    const { id } = await params;
    const riderId = parseInt(id);
    if (isNaN(riderId)) {
      return NextResponse.json({ success: false, error: "Invalid rider ID" }, { status: 400 });
    }

    let body: { amount: number; description?: string; idempotencyKey?: string };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ success: false, error: "Invalid JSON body" }, { status: 400 });
    }

    const amount = Number(body.amount);
    const description = typeof body.description === "string" ? body.description.trim() : "Generic top-up";
    const idempotencyKey = typeof body.idempotencyKey === "string" ? body.idempotencyKey.trim() : undefined;

    if (!(amount > 0)) {
      return NextResponse.json({ success: false, error: "Amount must be positive" }, { status: 400 });
    }

    const db = getDb();

    const [rider] = await db.select().from(riders).where(eq(riders.id, riderId)).limit(1);
    if (!rider) {
      return NextResponse.json({ success: false, error: "Rider not found" }, { status: 404 });
    }

    if (idempotencyKey) {
      const [existing] = await db
        .select({ id: walletLedger.id })
        .from(walletLedger)
        .where(
          and(
            eq(walletLedger.riderId, riderId),
            eq(walletLedger.entryType, "manual_add"),
            eq(walletLedger.refType, "add_balance"),
            eq(walletLedger.ref, idempotencyKey)
          )
        )
        .limit(1);
      if (existing) {
        const [wallet] = await db.select().from(riderWallet).where(eq(riderWallet.riderId, riderId)).limit(1);
        const blocks = await db
          .select({ serviceType: riderNegativeWalletBlocks.serviceType, reason: riderNegativeWalletBlocks.reason })
          .from(riderNegativeWalletBlocks)
          .where(eq(riderNegativeWalletBlocks.riderId, riderId));
        const totalBalance = wallet ? Number(wallet.totalBalance) : 0;
        return NextResponse.json({
          success: true,
          data: {
            totalBalance,
            globalWalletBlock: totalBalance <= GLOBAL_BLOCK_THRESHOLD,
            negativeWalletBlocks: blocks.map((b) => ({ serviceType: b.serviceType, reason: b.reason })),
            idempotent: true,
          },
        });
      }
    }

    let [wallet] = await db.select().from(riderWallet).where(eq(riderWallet.riderId, riderId)).limit(1);
    if (!wallet) {
      await db.insert(riderWallet).values({
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
      [wallet] = await db.select().from(riderWallet).where(eq(riderWallet.riderId, riderId)).limit(1);
    }

    const currentBalance = wallet ? Number(wallet.totalBalance) : 0;
    const balanceAfter = (currentBalance + amount).toFixed(2);
    const systemUser = await getSystemUserByEmail(user.email ?? "");
    const ref = idempotencyKey ?? `add_bal_${Date.now()}_${riderId}`;

    await db.insert(walletLedger).values({
      riderId,
      entryType: "manual_add",
      amount: amount.toFixed(2),
      balance: balanceAfter,
      serviceType: null,
      ref,
      refType: idempotencyKey ? "add_balance" : "add_balance",
      description,
      metadata: idempotencyKey ? { idempotencyKey } : {},
      performedByType: "agent",
      performedById: systemUser?.id ?? null,
    });

    await db
      .update(riderWallet)
      .set({
        totalBalance: balanceAfter,
        lastUpdatedAt: new Date(),
      })
      .where(eq(riderWallet.riderId, riderId));

    await applyFifoAllocation(riderId, amount);

    const [walletAfter] = await db.select().from(riderWallet).where(eq(riderWallet.riderId, riderId)).limit(1);
    const blocksAfter = await db
      .select({ serviceType: riderNegativeWalletBlocks.serviceType, reason: riderNegativeWalletBlocks.reason })
      .from(riderNegativeWalletBlocks)
      .where(eq(riderNegativeWalletBlocks.riderId, riderId));
    const totalBalanceAfter = walletAfter ? Number(walletAfter.totalBalance) : 0;

    await logActionByAuth(
      user.id,
      user.email ?? "",
      "RIDER",
      "RIDER_WALLET_ADJUSTED",
      {
        resourceType: "rider_wallet",
        resourceId: String(riderId),
        actionDetails: {
          riderId,
          amount,
          description,
          idempotencyKey: idempotencyKey ?? null,
          totalBalanceAfter,
          globalWalletBlock: totalBalanceAfter <= GLOBAL_BLOCK_THRESHOLD,
        },
        newValues: { amount, balanceAfter: totalBalanceAfter },
      }
    );

    return NextResponse.json({
      success: true,
      data: {
        totalBalance: totalBalanceAfter,
        globalWalletBlock: totalBalanceAfter <= GLOBAL_BLOCK_THRESHOLD,
        negativeWalletBlocks: blocksAfter.map((b) => ({ serviceType: b.serviceType, reason: b.reason })),
      },
    });
  } catch (error) {
    console.error("[POST /api/riders/[id]/wallet/add-balance] Error:", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Failed to add balance" },
      { status: 500 }
    );
  }
}
