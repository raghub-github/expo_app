import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getDb } from "@/lib/db/client";
import { riders, riderPenalties, riderWallet, walletLedger, systemUsers } from "@/lib/db/schema";
import { and, desc, eq, gte, ilike, isNull, lte, or, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { hasDashboardAccessByAuth, isSuperAdmin } from "@/lib/permissions/engine";
import { getSystemUserByEmail } from "@/lib/db/operations/users";
import { logActionByAuth, getIpAddress, getUserAgent } from "@/lib/audit/logger";
import { syncNegativeWalletBlocks } from "@/lib/rider-negative-wallet-blocks";

export const runtime = "nodejs";

/** POST – add penalty manually (order mistake, other mistake, etc.) */
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
    if (!userIsSuperAdmin && !hasRiderAccess) {
      return NextResponse.json({ success: false, error: "Insufficient permissions." }, { status: 403 });
    }

    const { id } = await params;
    const riderId = parseInt(id);
    if (isNaN(riderId)) {
      return NextResponse.json({ success: false, error: "Invalid rider ID" }, { status: 400 });
    }

    let body: { amount: number; reason: string; serviceType?: string | null; penaltyType?: string; orderId?: number };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ success: false, error: "Invalid JSON body" }, { status: 400 });
    }

    const amount = Number(body.amount);
    const reason = String(body.reason || "").trim();
    const rawServiceType = body.serviceType != null && body.serviceType !== "" ? String(body.serviceType).toLowerCase().trim() : "";
    const validServiceTypes = ["food", "parcel", "person_ride"] as const;
    const serviceTypeForDb = validServiceTypes.includes(rawServiceType as any) ? (rawServiceType as "food" | "parcel" | "person_ride") : null;
    // For wallet/ledger allocation we need a concrete service; use parcel when unspecified
    const serviceTypeForWallet = serviceTypeForDb ?? "parcel";

    const penaltyType = (body.penaltyType || "other") as string;
    const orderId = body.orderId != null ? Number(body.orderId) : null;

    if (!(amount > 0)) {
      return NextResponse.json({ success: false, error: "Amount must be positive" }, { status: 400 });
    }
    if (!reason) {
      return NextResponse.json({ success: false, error: "Reason is required" }, { status: 400 });
    }

    const db = getDb();

    const systemUser = await getSystemUserByEmail(user.email!);

    const [rider] = await db.select().from(riders).where(eq(riders.id, riderId)).limit(1);
    if (!rider) {
      return NextResponse.json({ success: false, error: "Rider not found" }, { status: 404 });
    }

    // Ensure rider_wallet row exists (ledger trigger will create if missing, but we need it for balanceAfter)
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
    const balanceAfter = (currentBalance - amount).toFixed(2);
    const newBalance = currentBalance - amount;

    // Service-level negative tracking: only count negative after wallet goes below zero (RULE 2)
    let negativeUsedDelta = 0;
    if (newBalance < 0) {
      if (currentBalance >= 0) {
        negativeUsedDelta = amount - currentBalance; // portion that went negative
      } else {
        negativeUsedDelta = amount;
      }
    }

    const [penalty] = await db
      .insert(riderPenalties)
      .values({
        riderId,
        serviceType: serviceTypeForDb,
        penaltyType,
        amount: amount.toFixed(2),
        reason,
        status: "active",
        orderId: orderId ?? null,
        imposedBy: systemUser?.id ?? null,
        source: "agent",
        metadata: { added_manually: true, source: "dashboard" },
      })
      .returning();

    await db.insert(walletLedger).values({
      riderId,
      entryType: "penalty",
      amount: amount.toFixed(2),
      balance: balanceAfter,
      serviceType: serviceTypeForWallet,
      ref: `pen_${penalty.id}`,
      refType: "penalty",
      description: reason,
      metadata: orderId != null ? { orderId } : {},
      performedByType: "agent",
      performedById: systemUser?.id ?? null,
    });

    // App is source of truth: update penalties_*, total_balance, and negative_used_* for this service (RULE 2)
    const pf = Number(wallet?.penaltiesFood ?? 0);
    const pp = Number(wallet?.penaltiesParcel ?? 0);
    const pr = Number(wallet?.penaltiesPersonRide ?? 0);
    const nuf = Number((wallet as { negativeUsedFood?: string })?.negativeUsedFood ?? 0);
    const nup = Number((wallet as { negativeUsedParcel?: string })?.negativeUsedParcel ?? 0);
    const nur = Number((wallet as { negativeUsedPersonRide?: string })?.negativeUsedPersonRide ?? 0);
    await db
      .update(riderWallet)
      .set({
        penaltiesFood: serviceTypeForWallet === "food" ? (pf + amount).toFixed(2) : (wallet?.penaltiesFood ?? "0"),
        penaltiesParcel: serviceTypeForWallet === "parcel" ? (pp + amount).toFixed(2) : (wallet?.penaltiesParcel ?? "0"),
        penaltiesPersonRide: serviceTypeForWallet === "person_ride" ? (pr + amount).toFixed(2) : (wallet?.penaltiesPersonRide ?? "0"),
        negativeUsedFood: (serviceTypeForWallet === "food" ? nuf + negativeUsedDelta : nuf).toFixed(2),
        negativeUsedParcel: (serviceTypeForWallet === "parcel" ? nup + negativeUsedDelta : nup).toFixed(2),
        negativeUsedPersonRide: (serviceTypeForWallet === "person_ride" ? nur + negativeUsedDelta : nur).toFixed(2),
        totalBalance: balanceAfter,
        lastUpdatedAt: new Date(),
      })
      .where(eq(riderWallet.riderId, riderId));

    await syncNegativeWalletBlocks(riderId);

    const agentEmail = user.email!;
    const agentName = (systemUser as { fullName?: string })?.fullName ?? null;
    await logActionByAuth(
      user.id,
      agentEmail,
      "RIDER",
      "RIDER_PENALTY_ADDED",
      {
        resourceType: "rider_penalty",
        resourceId: String(penalty.id),
        actionDetails: {
          riderId,
          penaltyId: penalty.id,
          amount,
          serviceType: serviceTypeForDb ?? "unspecified",
          penaltyType,
          orderId,
          reason,
          imposedBy: agentEmail,
          imposedByName: agentName,
          source: "agent",
        },
        newValues: { penaltyId: penalty.id, orderId, amount, serviceType: serviceTypeForDb ?? "unspecified", reason },
        requestPath: request.nextUrl?.pathname,
        requestMethod: "POST",
        ipAddress: getIpAddress(request),
        userAgent: getUserAgent(request),
      }
    );

    return NextResponse.json({ success: true, data: { penalty } });
  } catch (error) {
    console.error("[POST /api/riders/[id]/penalties] Error:", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user }, error: userError } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json(
        { success: false, error: "Not authenticated" },
        { status: 401 }
      );
    }

    const email = user.email ?? "";
    const userIsSuperAdmin = await isSuperAdmin(user.id, email);
    const hasRiderAccess = await hasDashboardAccessByAuth(user.id, email, "RIDER");

    if (!userIsSuperAdmin && !hasRiderAccess) {
      return NextResponse.json(
        {
          success: false,
          error: "Insufficient permissions. RIDER dashboard access required.",
        },
        { status: 403 }
      );
    }

    const { id } = await params;
    const riderId = parseInt(id);
    if (isNaN(riderId)) {
      return NextResponse.json(
        { success: false, error: "Invalid rider ID" },
        { status: 400 }
      );
    }

    const db = getDb();

    // Ensure rider exists
    const [rider] = await db
      .select()
      .from(riders)
      .where(eq(riders.id, riderId))
      .limit(1);

    if (!rider) {
      return NextResponse.json(
        { success: false, error: "Rider not found" },
        { status: 404 }
      );
    }

    const { searchParams } = new URL(request.url);
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") || "20", 10) || 20));
    const offset = Math.max(0, parseInt(searchParams.get("offset") || "0", 10) || 0);
    const from = searchParams.get("from");
    const to = searchParams.get("to");
    const serviceType = searchParams.get("serviceType"); // food / parcel / person_ride
    const status = searchParams.get("status"); // active / reversed / paid / etc.
    const q = (searchParams.get("q") || "").trim();

    const conditions: any[] = [eq(riderPenalties.riderId, riderId)];

    if (serviceType && serviceType !== "all") {
      if (serviceType === "unspecified" || serviceType === "null") {
        conditions.push(isNull(riderPenalties.serviceType));
      } else {
        conditions.push(eq(riderPenalties.serviceType, serviceType as any));
      }
    }

    if (status && status !== "all") {
      conditions.push(eq(riderPenalties.status, status));
    }

    if (from) {
      conditions.push(gte(riderPenalties.imposedAt, new Date(from)));
    }
    if (to) {
      conditions.push(lte(riderPenalties.imposedAt, new Date(to)));
    }

    if (q) {
      const num = parseInt(q, 10);
      const isNumeric = !Number.isNaN(num) && String(num) === q;
      if (isNumeric) {
        conditions.push(or(eq(riderPenalties.id, num), eq(riderPenalties.orderId, num)) as any);
      } else {
        const term = `%${q.replace(/%/g, "\\%").replace(/_/g, "\\_")}%`;
        conditions.push(ilike(riderPenalties.reason, term) as any);
      }
    }

    const whereClause =
      conditions.length > 1 ? and(...conditions) : conditions[0];

    const [{ count: total }] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(riderPenalties)
      .where(whereClause);

    const imposedByUser = alias(systemUsers, "imposed_by_user");
    const reversedByUser = alias(systemUsers, "reversed_by_user");

    const penaltyRows = await db
      .select({
        penalty: riderPenalties,
        imposedByEmail: imposedByUser.email,
        imposedByName: imposedByUser.fullName,
        reversedByEmail: reversedByUser.email,
        reversedByName: reversedByUser.fullName,
      })
      .from(riderPenalties)
      .leftJoin(imposedByUser, eq(riderPenalties.imposedBy, imposedByUser.id))
      .leftJoin(reversedByUser, eq(riderPenalties.reversedBy, reversedByUser.id))
      .where(whereClause)
      .orderBy(desc(riderPenalties.imposedAt))
      .limit(Number.isNaN(limit) ? 20 : limit)
      .offset(offset);

    const penalties = penaltyRows.map((row) => ({
      ...row.penalty,
      imposedByUser: row.imposedByEmail
        ? { email: row.imposedByEmail, fullName: row.imposedByName }
        : null,
      reversedByUser: row.reversedByEmail
        ? { email: row.reversedByEmail, fullName: row.reversedByName }
        : null,
    }));

    return NextResponse.json({
      success: true,
      data: {
        penalties,
        total: Number(total) ?? 0,
      },
    });
  } catch (error) {
    console.error("[GET /api/riders/[id]/penalties] Error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

