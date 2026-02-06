import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getDb } from "@/lib/db/client";
import { riders, riderPenalties, riderWallet, walletLedger, systemUsers } from "@/lib/db/schema";
import { and, desc, eq, gte, lte } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { hasDashboardAccessByAuth, isSuperAdmin } from "@/lib/permissions/engine";
import { canPerformRiderServiceAction } from "@/lib/permissions/actions";
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
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();
    if (sessionError || !session) {
      return NextResponse.json({ success: false, error: "Not authenticated" }, { status: 401 });
    }

    const userIsSuperAdmin = await isSuperAdmin(session.user.id, session.user.email!);
    const hasRiderAccess = await hasDashboardAccessByAuth(session.user.id, session.user.email!, "RIDER");
    if (!userIsSuperAdmin && !hasRiderAccess) {
      return NextResponse.json({ success: false, error: "Insufficient permissions." }, { status: 403 });
    }

    const { id } = await params;
    const riderId = parseInt(id);
    if (isNaN(riderId)) {
      return NextResponse.json({ success: false, error: "Invalid rider ID" }, { status: 400 });
    }

    let body: { amount: number; reason: string; serviceType: string; penaltyType?: string; orderId?: number };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ success: false, error: "Invalid JSON body" }, { status: 400 });
    }

    const amount = Number(body.amount);
    const reason = String(body.reason || "").trim();
    const serviceType = (body.serviceType || "food") as "food" | "parcel" | "person_ride";

    const canAddPenalty =
      userIsSuperAdmin ||
      (await canPerformRiderServiceAction(session.user.id, session.user.email!, serviceType, "UPDATE"));
    if (!canAddPenalty) {
      return NextResponse.json(
        { success: false, error: "Insufficient permissions. Rider action (penalty) access required for this service." },
        { status: 403 }
      );
    }
    const penaltyType = (body.penaltyType || "other") as string;
    const orderId = body.orderId != null ? Number(body.orderId) : null;

    if (!(amount > 0)) {
      return NextResponse.json({ success: false, error: "Amount must be positive" }, { status: 400 });
    }
    if (!reason) {
      return NextResponse.json({ success: false, error: "Reason is required" }, { status: 400 });
    }
    if (!["food", "parcel", "person_ride"].includes(serviceType)) {
      return NextResponse.json({ success: false, error: "Invalid serviceType" }, { status: 400 });
    }

    const db = getDb();

    const systemUser = await getSystemUserByEmail(session.user.email!);

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

    const [penalty] = await db
      .insert(riderPenalties)
      .values({
        riderId,
        serviceType,
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
      serviceType,
      ref: `pen_${penalty.id}`,
      refType: "penalty",
      description: reason,
      metadata: orderId != null ? { orderId } : {},
      performedByType: "agent",
      performedById: systemUser?.id ?? null,
    });

    // App is source of truth for penalty: update only this service's penalty so block logic is correct
    // (DB trigger skips penalty; see migration 0077)
    const pf = Number(wallet?.penaltiesFood ?? 0);
    const pp = Number(wallet?.penaltiesParcel ?? 0);
    const pr = Number(wallet?.penaltiesPersonRide ?? 0);
    await db
      .update(riderWallet)
      .set({
        penaltiesFood: serviceType === "food" ? (pf + amount).toFixed(2) : (wallet?.penaltiesFood ?? "0"),
        penaltiesParcel: serviceType === "parcel" ? (pp + amount).toFixed(2) : (wallet?.penaltiesParcel ?? "0"),
        penaltiesPersonRide: serviceType === "person_ride" ? (pr + amount).toFixed(2) : (wallet?.penaltiesPersonRide ?? "0"),
        totalBalance: balanceAfter,
        lastUpdatedAt: new Date(),
      })
      .where(eq(riderWallet.riderId, riderId));

    await syncNegativeWalletBlocks(riderId);

    const agentEmail = session.user.email!;
    const agentName = (systemUser as { fullName?: string })?.fullName ?? null;
    await logActionByAuth(
      session.user.id,
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
          serviceType,
          penaltyType,
          orderId,
          reason,
          imposedBy: agentEmail,
          imposedByName: agentName,
          source: "agent",
        },
        newValues: { penaltyId: penalty.id, orderId, amount, serviceType, reason },
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
    const {
      data: { session },
      error: sessionError,
    } = await supabase.auth.getSession();

    if (sessionError || !session) {
      return NextResponse.json(
        { success: false, error: "Not authenticated" },
        { status: 401 }
      );
    }

    const userIsSuperAdmin = await isSuperAdmin(session.user.id, session.user.email!);
    const hasRiderAccess = await hasDashboardAccessByAuth(
      session.user.id,
      session.user.email!,
      "RIDER"
    );

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
    const limit = parseInt(searchParams.get("limit") || "20");
    const from = searchParams.get("from");
    const to = searchParams.get("to");
    const serviceType = searchParams.get("serviceType"); // food / parcel / person_ride
    const status = searchParams.get("status"); // active / reversed / paid / etc.

    const conditions: any[] = [eq(riderPenalties.riderId, riderId)];

    if (serviceType && serviceType !== "all") {
      conditions.push(eq(riderPenalties.serviceType, serviceType as any));
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

    const whereClause =
      conditions.length > 1 ? and(...conditions) : conditions[0];

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
      .limit(Number.isNaN(limit) ? 20 : limit);

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

