/**
 * POST /api/riders/[id]/wallet-credit-requests
 * Create a wallet credit request (agent). Requires RIDER dashboard + RIDER_WALLET_CREDITS CREATE.
 */

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getDb } from "@/lib/db/client";
import { riders, walletCreditRequests } from "@/lib/db/schema";
import { eq, and, sql, isNull } from "drizzle-orm";
import { getSystemUserIdFromAuthUser, hasDashboardAccess, hasAccessPointAction, isSuperAdmin } from "@/lib/permissions/engine";
import { getSystemUserByEmail } from "@/lib/db/operations/users";
import { logActionByAuth } from "@/lib/audit/logger";

export const runtime = "nodejs";

const SERVICE_TYPES = ["food", "parcel", "person_ride"] as const;

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

    const systemUserId = await getSystemUserIdFromAuthUser(user.id, user.email ?? undefined);
    if (!systemUserId) {
      return NextResponse.json({ success: false, error: "User not found" }, { status: 403 });
    }

    // Any agent with RIDER dashboard access (view or full) can request add amount
    const canCreate =
      (await isSuperAdmin(user.id, user.email ?? "")) ||
      (await hasDashboardAccess(systemUserId, "RIDER"));
    if (!canCreate) {
      return NextResponse.json({ success: false, error: "Insufficient permissions. RIDER dashboard access required." }, { status: 403 });
    }

    const { id } = await params;
    const riderId = parseInt(id);
    if (isNaN(riderId)) {
      return NextResponse.json({ success: false, error: "Invalid rider ID" }, { status: 400 });
    }

    let body: {
      amount: number;
      reason: string;
      orderId?: number;
      serviceType?: string;
      idempotencyKey?: string;
    };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ success: false, error: "Invalid JSON body" }, { status: 400 });
    }

    const amount = Number(body.amount);
    const reason = typeof body.reason === "string" ? body.reason.trim() : "";
    const orderId = body.orderId != null ? Number(body.orderId) : null;
    const serviceType =
      body.serviceType && SERVICE_TYPES.includes(body.serviceType as any)
        ? (body.serviceType as "food" | "parcel" | "person_ride")
        : null;
    const idempotencyKey = typeof body.idempotencyKey === "string" ? body.idempotencyKey.trim() || null : null;

    if (!(amount > 0)) {
      return NextResponse.json({ success: false, error: "Amount must be positive" }, { status: 400 });
    }
    if (!reason) {
      return NextResponse.json({ success: false, error: "Reason is required" }, { status: 400 });
    }

    const db = getDb();

    const [rider] = await db.select().from(riders).where(eq(riders.id, riderId)).limit(1);
    if (!rider) {
      return NextResponse.json({ success: false, error: "Rider not found" }, { status: 404 });
    }

    // Idempotency: same requester + idempotencyKey
    if (idempotencyKey) {
      const [existing] = await db
        .select()
        .from(walletCreditRequests)
        .where(
          and(
            eq(walletCreditRequests.requestedBySystemUserId, systemUserId),
            eq(walletCreditRequests.idempotencyKey, idempotencyKey)
          )
        )
        .limit(1);
      if (existing) {
        return NextResponse.json({
          success: true,
          data: {
            id: existing.id,
            riderId: existing.riderId,
            orderId: existing.orderId ?? undefined,
            amount: Number(existing.amount),
            reason: existing.reason,
            status: existing.status,
            requestedAt: existing.requestedAt,
            idempotent: true,
          },
        });
      }
    }

    // Fallback dedupe: pending with same rider, order (or both null), amount, reason
    const orderMatch = orderId == null ? isNull(walletCreditRequests.orderId) : eq(walletCreditRequests.orderId, orderId);
    const [pendingDup] = await db
      .select({ id: walletCreditRequests.id })
      .from(walletCreditRequests)
      .where(
        and(
          eq(walletCreditRequests.riderId, riderId),
          eq(walletCreditRequests.status, "pending"),
          sql`${walletCreditRequests.amount} = ${amount.toFixed(2)}`,
          eq(walletCreditRequests.reason, reason),
          orderMatch
        )
      )
      .limit(1);
    if (pendingDup) {
      const [existing] = await db.select().from(walletCreditRequests).where(eq(walletCreditRequests.id, pendingDup.id)).limit(1);
      if (existing) {
        return NextResponse.json({
          success: true,
          data: {
            id: existing.id,
            riderId: existing.riderId,
            orderId: existing.orderId ?? undefined,
            amount: Number(existing.amount),
            reason: existing.reason,
            status: existing.status,
            requestedAt: existing.requestedAt,
            idempotent: true,
          },
        });
      }
    }

    const systemUser = await getSystemUserByEmail(user.email!);
    const requestedByEmail = systemUser?.email ?? user.email ?? null;

    const [inserted] = await db
      .insert(walletCreditRequests)
      .values({
        riderId,
        orderId: orderId ?? null,
        serviceType,
        amount: amount.toFixed(2),
        reason,
        status: "pending",
        idempotencyKey,
        requestedBySystemUserId: systemUserId,
        requestedByEmail,
        metadata: {},
      })
      .returning();

    await logActionByAuth(
      user.id,
      user.email!,
      "RIDER",
      "REQUEST_CREATE",
      {
        resourceType: "wallet_credit_request",
        resourceId: String(inserted.id),
        actionDetails: { riderId, orderId, amount, reason, requestId: inserted.id },
        newValues: { id: inserted.id, status: "pending" },
      }
    );

    return NextResponse.json({
      success: true,
      data: {
        id: inserted.id,
        riderId: inserted.riderId,
        orderId: inserted.orderId ?? undefined,
        serviceType: inserted.serviceType ?? undefined,
        amount: Number(inserted.amount),
        reason: inserted.reason,
        status: inserted.status,
        requestedAt: inserted.requestedAt,
        requestedByEmail: inserted.requestedByEmail ?? undefined,
      },
    });
  } catch (error) {
    console.error("[POST /api/riders/[id]/wallet-credit-requests] Error:", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Failed to create request" },
      { status: 500 }
    );
  }
}
