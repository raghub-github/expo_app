/**
 * POST /api/riders/[id]/penalties/[penaltyId]/revert – Revert (reverse) a penalty
 * Sets penalty status to 'reversed', credits rider wallet, adds penalty_reversal ledger entry.
 * Idempotent: each penalty can be reverted at most once (row lock + ledger ref check).
 */

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getDb } from "@/lib/db/client";
import { riderPenalties, riderWallet, walletLedger } from "@/lib/db/schema";
import { eq, and, sql } from "drizzle-orm";
import { hasDashboardAccessByAuth, isSuperAdmin } from "@/lib/permissions/engine";
import { canPerformRiderServiceAction } from "@/lib/permissions/actions";
import { getSystemUserByEmail } from "@/lib/db/operations/users";
import { logActionByAuth, getIpAddress, getUserAgent } from "@/lib/audit/logger";
import { syncNegativeWalletBlocks } from "@/lib/rider-negative-wallet-blocks";

export const runtime = "nodejs";

const LEDGER_DESCRIPTION = "Penalty Credited Back";

type Db = ReturnType<typeof getDb>;
type DbTx = Parameters<Parameters<Db["transaction"]>[0]>[0];

async function ensureRiderWalletRow(db: Db | DbTx, riderId: number) {
  let [wallet] = await db.select().from(riderWallet).where(eq(riderWallet.riderId, riderId)).limit(1);
  if (wallet) return wallet;

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
  if (!wallet) {
    throw new Error("Failed to initialize rider wallet");
  }
  return wallet;
}

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

    const [penaltyPreview] = await db
      .select()
      .from(riderPenalties)
      .where(and(eq(riderPenalties.id, penaltyIdNum), eq(riderPenalties.riderId, riderId)))
      .limit(1);

    if (!penaltyPreview) {
      return NextResponse.json({ success: false, error: "Penalty not found" }, { status: 404 });
    }

    if (penaltyPreview.status === "reversed") {
      return NextResponse.json(
        { success: false, error: "Penalty already reversed", code: "ALREADY_REVERSED" },
        { status: 400 }
      );
    }

    const rawServiceType =
      penaltyPreview.serviceType != null ? String(penaltyPreview.serviceType).toLowerCase().trim() : "";
    const validServiceTypes = ["food", "parcel", "person_ride"] as const;
    const serviceType = validServiceTypes.includes(rawServiceType as (typeof validServiceTypes)[number])
      ? (rawServiceType as "food" | "parcel" | "person_ride")
      : "parcel";
    const canRevert =
      userIsSuperAdmin ||
      (await canPerformRiderServiceAction(user.id, email, serviceType, "UPDATE"));
    if (!canRevert) {
      return NextResponse.json(
        {
          success: false,
          error: "Insufficient permissions. Rider action (penalty revert) access required for this service.",
          code: "FORBIDDEN",
        },
        { status: 403 }
      );
    }

    const amount = Number(penaltyPreview.amount);
    if (!(amount > 0)) {
      return NextResponse.json({ success: false, error: "Invalid penalty amount" }, { status: 400 });
    }

    const ledgerRef = `pen_revert_${penaltyIdNum}`;
    let creditedAmount = 0;
    let alreadyReversed = false;

    await db.transaction(async (tx) => {
      // Lock the penalty row so concurrent reverts cannot both credit the wallet.
      const locked = await tx.execute(sql`
        SELECT id, status, amount, reason, service_type, order_id, metadata
        FROM rider_penalties
        WHERE id = ${penaltyIdNum} AND rider_id = ${riderId}
        FOR UPDATE
      `);
      const row = (locked as unknown as Array<Record<string, unknown>>)[0];
      if (!row) {
        throw new Error("Penalty not found");
      }
      if (String(row.status) === "reversed") {
        alreadyReversed = true;
        return;
      }

      const [existingLedger] = await tx
        .select({ id: walletLedger.id })
        .from(walletLedger)
        .where(
          and(
            eq(walletLedger.riderId, riderId),
            eq(walletLedger.ref, ledgerRef),
            eq(walletLedger.entryType, "penalty_reversal")
          )
        )
        .limit(1);
      if (existingLedger) {
        // Ledger already credited — ensure status is reversed and exit without second credit.
        await tx
          .update(riderPenalties)
          .set({
            status: "reversed",
            resolvedAt: new Date(),
            resolutionNotes,
            reversedBy: systemUser?.id ?? null,
          })
          .where(and(eq(riderPenalties.id, penaltyIdNum), sql`${riderPenalties.status} IS DISTINCT FROM 'reversed'`));
        alreadyReversed = true;
        return;
      }

      const penaltyMetadata =
        typeof row.metadata === "object" && row.metadata !== null
          ? (row.metadata as Record<string, unknown>)
          : {};

      const wallet = await ensureRiderWalletRow(tx, riderId);
      const currentBalance = Number(wallet.totalBalance ?? 0);
      const balanceAfter = currentBalance + amount;

      const nuf = Number((wallet as { negativeUsedFood?: string }).negativeUsedFood ?? 0);
      const nup = Number((wallet as { negativeUsedParcel?: string }).negativeUsedParcel ?? 0);
      const nur = Number((wallet as { negativeUsedPersonRide?: string }).negativeUsedPersonRide ?? 0);
      const reduceBy = (v: number) => Math.max(0, v - amount);
      const newNuf = serviceType === "food" ? reduceBy(nuf) : nuf;
      const newNup = serviceType === "parcel" ? reduceBy(nup) : nup;
      const newNur = serviceType === "person_ride" ? reduceBy(nur) : nur;
      const resetNegative = balanceAfter >= 0;

      const pf = Number(wallet.penaltiesFood ?? 0);
      const pp = Number(wallet.penaltiesParcel ?? 0);
      const pr = Number(wallet.penaltiesPersonRide ?? 0);

      // Status flip first — only one concurrent txn wins.
      const updated = await tx
        .update(riderPenalties)
        .set({
          status: "reversed",
          resolvedAt: new Date(),
          resolutionNotes,
          reversedBy: systemUser?.id ?? null,
          metadata: {
            ...penaltyMetadata,
            reverted_at: new Date().toISOString(),
          },
        })
        .where(
          and(
            eq(riderPenalties.id, penaltyIdNum),
            sql`${riderPenalties.status} IS DISTINCT FROM 'reversed'`
          )
        )
        .returning({ id: riderPenalties.id });

      if (!updated[0]) {
        alreadyReversed = true;
        return;
      }

      await tx.insert(walletLedger).values({
        riderId,
        entryType: "penalty_reversal",
        amount: amount.toFixed(2),
        balance: balanceAfter.toFixed(2),
        serviceType,
        ref: ledgerRef,
        refType: "penalty_revert",
        description: LEDGER_DESCRIPTION,
        metadata: {
          penaltyId: penaltyIdNum,
          revertReason: resolutionNotes,
          originalReason: String(row.reason ?? ""),
          ...(row.order_id != null ? { orderId: Number(row.order_id) } : {}),
          ...penaltyMetadata,
        },
        performedByType: "agent",
        performedById: systemUser?.id ?? null,
      });

      await tx
        .update(riderWallet)
        .set({
          penaltiesFood:
            serviceType === "food" ? Math.max(0, pf - amount).toFixed(2) : (wallet.penaltiesFood ?? "0"),
          penaltiesParcel:
            serviceType === "parcel" ? Math.max(0, pp - amount).toFixed(2) : (wallet.penaltiesParcel ?? "0"),
          penaltiesPersonRide:
            serviceType === "person_ride"
              ? Math.max(0, pr - amount).toFixed(2)
              : (wallet.penaltiesPersonRide ?? "0"),
          negativeUsedFood: (resetNegative ? 0 : newNuf).toFixed(2),
          negativeUsedParcel: (resetNegative ? 0 : newNup).toFixed(2),
          negativeUsedPersonRide: (resetNegative ? 0 : newNur).toFixed(2),
          unblockAllocFood: resetNegative
            ? "0"
            : ((wallet as { unblockAllocFood?: string }).unblockAllocFood ?? "0"),
          unblockAllocParcel: resetNegative
            ? "0"
            : ((wallet as { unblockAllocParcel?: string }).unblockAllocParcel ?? "0"),
          unblockAllocPersonRide: resetNegative
            ? "0"
            : ((wallet as { unblockAllocPersonRide?: string }).unblockAllocPersonRide ?? "0"),
          totalBalance: balanceAfter.toFixed(2),
          lastUpdatedAt: new Date(),
        })
        .where(eq(riderWallet.riderId, riderId));

      creditedAmount = amount;
    });

    if (alreadyReversed && creditedAmount <= 0) {
      return NextResponse.json(
        { success: false, error: "Penalty already reversed", code: "ALREADY_REVERSED" },
        { status: 400 }
      );
    }

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
          amount: creditedAmount,
          serviceType,
          resolutionNotes,
          revertReason: resolutionNotes,
          ledgerDescription: LEDGER_DESCRIPTION,
          revertedBy: agentEmail,
          revertedByName: agentName,
        },
        previousValues: { status: penaltyPreview.status, penaltyReason: penaltyPreview.reason },
        newValues: { status: "reversed", resolutionNotes },
        requestPath: request.nextUrl?.pathname,
        requestMethod: "POST",
        ipAddress: getIpAddress(request),
        userAgent: getUserAgent(request),
      }
    );

    return NextResponse.json({
      success: true,
      data: {
        penaltyId: penaltyIdNum,
        status: "reversed",
        creditedAmount,
        ledgerDescription: LEDGER_DESCRIPTION,
      },
    });
  } catch (error) {
    console.error("[POST /api/riders/[id]/penalties/[penaltyId]/revert] Error:", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
