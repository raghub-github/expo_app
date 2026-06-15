/**
 * POST /api/riders/[id]/payment-methods/bank/verify — verify or reject rider bank account
 */

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getDb } from "@/lib/db/client";
import { riderPaymentMethods } from "@/lib/db/schema";
import { and, desc, eq, isNull } from "drizzle-orm";
import { isSuperAdmin } from "@/lib/permissions/engine";
import { canPerformActionByAuth } from "@/lib/permissions/actions";
import { getSystemUserByEmail } from "@/lib/db/operations/users";
import { z } from "zod";

export const runtime = "nodejs";

const BodySchema = z.object({
  action: z.enum(["verify", "reject"]),
  reason: z.string().max(500).optional(),
});

export async function POST(
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
    const canApprove = await canPerformActionByAuth(
      user.id,
      email,
      "RIDER",
      "APPROVE",
      "RIDER_DOCUMENT",
    );

    if (!userIsSuperAdmin && !canApprove) {
      return NextResponse.json(
        { success: false, error: "Insufficient permissions to verify bank account" },
        { status: 403 },
      );
    }

    const agent = await getSystemUserByEmail(email);
    if (!agent) {
      return NextResponse.json(
        { success: false, error: "Agent account not found" },
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

    const parsed = BodySchema.safeParse(await request.json().catch(() => ({})));
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: "Invalid request body" },
        { status: 400 },
      );
    }

    const { action, reason } = parsed.data;
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

    const now = new Date();
    const nextStatus = action === "verify" ? "verified" : "rejected";

    if (bankAccount.verificationStatus === nextStatus) {
      return NextResponse.json({
        success: true,
        data: {
          paymentMethodId: bankAccount.id,
          verificationStatus: nextStatus,
          alreadySet: true,
        },
      });
    }

    await db
      .update(riderPaymentMethods)
      .set({
        verificationStatus: nextStatus,
        verifiedAt: action === "verify" ? now : null,
        verifiedBy: agent.id,
        updatedAt: now,
      })
      .where(eq(riderPaymentMethods.id, bankAccount.id));

    return NextResponse.json({
      success: true,
      data: {
        paymentMethodId: bankAccount.id,
        verificationStatus: nextStatus,
        verifiedAt: action === "verify" ? now.toISOString() : null,
        reason: action === "reject" ? reason ?? null : null,
      },
    });
  } catch (error) {
    console.error("[POST /api/riders/[id]/payment-methods/bank/verify] Error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to update bank account verification" },
      { status: 500 },
    );
  }
}
