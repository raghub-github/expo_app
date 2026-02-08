/**
 * POST /api/riders/[id]/penalties/[penaltyId]/revert – Revert (reverse) a penalty
 * Sets penalty status to 'reversed', credits wallet when was paid, adds refund ledger entry.
 * Tracks who reverted (reversed_by) and reason (resolutionNotes). All actions audited.
 */

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getDb } from "@/lib/db/client";
import { riderPenalties, riderWallet, walletLedger } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { hasDashboardAccessByAuth, isSuperAdmin } from "@/lib/permissions/engine";
import { canPerformRiderServiceAction } from "@/lib/permissions/actions";
import { getSystemUserByEmail } from "@/lib/db/operations/users";
import { logActionByAuth, getIpAddress, getUserAgent } from "@/lib/audit/logger";
import { syncNegativeWalletBlocks } from "@/lib/rider-negative-wallet-blocks";

export const runtime = "nodejs";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; penaltyId: string }> }
) {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return NextResponse.json({ success: false, error: "Not authenticated" }, { status: 401 });
    }
    const email = user.email ?? "";
    const systemUserForAccess = await getSystemUserByEmail(email);
    if (!systemUserForAccess) {
      return NextResponse.json(
        { success: false, error: "Your account is not set up as an agent. Please contact admin.", code: "AGENT_NOT_FOUND" },
        { status: 403 }
      );
    }
    const userIsSuperAdmin = await isSuperAdmin(user.id, email);
    const hasRiderAccess = await hasDashboardAccessByAuth(user.id, email, "RIDER");
    if (!userIsSuperAdmin && !hasRiderAccess) {
      return NextResponse.json(
        { success: false, error: "Insufficient permissions.", code: "FORBIDDEN" },
        { status: 403 }
      );
    }

    const { id, penaltyId } = await params;
    const riderId = parseInt(id);
    const penaltyIdNum = parseInt(penaltyId);
    if (isNaN(riderId) || isNaN(penaltyIdNum)) {
      return NextResponse.json({ success: false, error: "Invalid rider or penalty ID" }, { status: 400 });
    }

    let body: { reason?: string } = {};
    try {
      body = await request.json();
    } catch {
      // optional body
    }
    const reasonTrimmed = typeof body.reason === "string" ? body.reason.trim() : "";
    if (!reasonTrimmed) {
      return NextResponse.json(
        { success: false, error: "Reason for reverting the penalty is required." },
        { status: 400 }
      );
    }
    const resolutionNotes = reasonTrimmed;

    const systemUser = systemUserForAccess;
    const db = getDb();

    const [penalty] = await db
      .select()
      .from(riderPenalties)
      .where(and(eq(riderPenalties.id, penaltyIdNum), eq(riderPenalties.riderId, riderId)))
      .limit(1);

    if (!penalty) {
      return NextResponse.json({ success: false, error: "Penalty not found" }, { status: 404 });
    }

    // Normalize serviceType from DB (enum may come as string or driver-specific; handle null/legacy)
    const rawServiceType = penalty.serviceType != null ? String(penalty.serviceType).toLowerCase().trim() : "";
    const validServiceTypes = ["food", "parcel", "person_ride"] as const;
    const serviceType = validServiceTypes.includes(rawServiceType as any)
      ? (rawServiceType as "food" | "parcel" | "person_ride")
      : "parcel";
    const canRevert =
      userIsSuperAdmin ||
      (await canPerformRiderServiceAction(user.id, email, serviceType, "UPDATE"));
    if (!canRevert) {
      return NextResponse.json(
        { success: false, error: "Insufficient permissions. Rider action (penalty revert) access required for this service.", code: "FORBIDDEN" },
        { status: 403 }
      );
    }

    if (penalty.status === "reversed") {
      return NextResponse.json({ success: false, error: "Penalty already reversed" }, { status: 400 });
    }

    const amount = Number(penalty.amount);

    await db
      .update(riderPenalties)
      .set({
        status: "reversed",
        resolvedAt: new Date(),
        resolutionNotes,
        reversedBy: systemUser?.id ?? null,
        metadata: {
          ...(typeof penalty.metadata === "object" && penalty.metadata !== null ? penalty.metadata : {}),
          reverted_at: new Date().toISOString(),
        },
      })
      .where(eq(riderPenalties.id, penaltyIdNum));

    const [wallet] = await db.select().from(riderWallet).where(eq(riderWallet.riderId, riderId)).limit(1);
    const balanceAfter = wallet ? Number(wallet.totalBalance) + amount : amount;
    const nuf = Number((wallet as { negativeUsedFood?: string })?.negativeUsedFood ?? 0);
    const nup = Number((wallet as { negativeUsedParcel?: string })?.negativeUsedParcel ?? 0);
    const nur = Number((wallet as { negativeUsedPersonRide?: string })?.negativeUsedPersonRide ?? 0);
    const reduceBy = (v: number) => Math.max(0, v - amount);
    const newNuf = serviceType === "food" ? reduceBy(nuf) : nuf;
    const newNup = serviceType === "parcel" ? reduceBy(nup) : nup;
    const newNur = serviceType === "person_ride" ? reduceBy(nur) : nur;
    const resetNegative = balanceAfter >= 0;
    await db.insert(walletLedger).values({
      riderId,
      entryType: "penalty_reversal",
      amount: amount.toFixed(2),
      balance: balanceAfter.toFixed(2),
      serviceType,
      ref: `pen_revert_${penaltyIdNum}`,
      refType: "penalty_revert",
      description: `Penalty reverted: ${penalty.reason}. ${resolutionNotes}`,
      metadata: penalty.orderId != null ? { orderId: penalty.orderId } : {},
      performedByType: "agent",
      performedById: systemUser?.id ?? null,
    });

    // App is source of truth: decrease penalty and negative_used for this service; if balance >= 0 reset all negative_used and unblock_alloc (RULE 4)
    const pf = Number(wallet?.penaltiesFood ?? 0);
    const pp = Number(wallet?.penaltiesParcel ?? 0);
    const pr = Number(wallet?.penaltiesPersonRide ?? 0);
    await db
      .update(riderWallet)
      .set({
        penaltiesFood: serviceType === "food" ? Math.max(0, pf - amount).toFixed(2) : (wallet?.penaltiesFood ?? "0"),
        penaltiesParcel: serviceType === "parcel" ? Math.max(0, pp - amount).toFixed(2) : (wallet?.penaltiesParcel ?? "0"),
        penaltiesPersonRide: serviceType === "person_ride" ? Math.max(0, pr - amount).toFixed(2) : (wallet?.penaltiesPersonRide ?? "0"),
        negativeUsedFood: (resetNegative ? 0 : newNuf).toFixed(2),
        negativeUsedParcel: (resetNegative ? 0 : newNup).toFixed(2),
        negativeUsedPersonRide: (resetNegative ? 0 : newNur).toFixed(2),
        unblockAllocFood: resetNegative ? "0" : (wallet as { unblockAllocFood?: string })?.unblockAllocFood ?? "0",
        unblockAllocParcel: resetNegative ? "0" : (wallet as { unblockAllocParcel?: string })?.unblockAllocParcel ?? "0",
        unblockAllocPersonRide: resetNegative ? "0" : (wallet as { unblockAllocPersonRide?: string })?.unblockAllocPersonRide ?? "0",
        totalBalance: balanceAfter.toFixed(2),
        lastUpdatedAt: new Date(),
      })
      .where(eq(riderWallet.riderId, riderId));

    await syncNegativeWalletBlocks(riderId);

    const agentEmail = email;
    const agentName = (systemUser as { fullName?: string })?.fullName ?? null;
    await logActionByAuth(
      user.id,
      agentEmail,
      "RIDER",
      "RIDER_PENALTY_REVERTED",
      {
        resourceType: "rider_penalty",
        resourceId: String(penaltyIdNum),
        actionDetails: {
          riderId,
          penaltyId: penaltyIdNum,
          amount,
          serviceType,
          resolutionNotes,
          revertReason: resolutionNotes,
          revertedBy: agentEmail,
          revertedByName: agentName,
        },
        previousValues: { status: penalty.status, penaltyReason: penalty.reason },
        newValues: { status: "reversed", resolutionNotes },
        requestPath: request.nextUrl?.pathname,
        requestMethod: "POST",
        ipAddress: getIpAddress(request),
        userAgent: getUserAgent(request),
      }
    );

    return NextResponse.json({ success: true, data: { penaltyId: penaltyIdNum, status: "reversed" } });
  } catch (error) {
    console.error("[POST /api/riders/[id]/penalties/[penaltyId]/revert] Error:", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
