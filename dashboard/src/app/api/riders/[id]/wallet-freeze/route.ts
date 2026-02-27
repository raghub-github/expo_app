/**
 * GET  – current wallet freeze status + latest action with agent email
 * POST – freeze or unfreeze wallet (body: { action: 'freeze'|'unfreeze', reason?: string })
 */
import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getDb } from "@/lib/db/client";
import {
  riderWallet,
  riderWalletFreezeHistory,
  systemUsers,
} from "@/lib/db/schema";
import { desc, eq } from "drizzle-orm";
import { hasDashboardAccessByAuth, isSuperAdmin } from "@/lib/permissions/engine";
import { canPerformRiderActionAnyService } from "@/lib/permissions/actions";
import { getSystemUserByEmail } from "@/lib/auth/user-mapping";

export const runtime = "nodejs";

async function getAuthAndRider(
  request: NextRequest,
  params: { id: string }
): Promise<
  | { error: NextResponse }
  | { db: Awaited<ReturnType<typeof getDb>>; riderId: number; systemUserId: number }
> {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (userError || !user) {
    return { error: NextResponse.json({ success: false, error: "Not authenticated" }, { status: 401 }) };
  }

  const userIsSuperAdmin = await isSuperAdmin(user.id, user.email ?? "");
  const hasRiderAccess = await hasDashboardAccessByAuth(
    user.id,
    user.email ?? "",
    "RIDER"
  );
  if (!userIsSuperAdmin && !hasRiderAccess) {
    return { error: NextResponse.json({ success: false, error: "Insufficient permissions." }, { status: 403 }) };
  }

  const riderId = parseInt(params.id, 10);
  if (Number.isNaN(riderId)) {
    return { error: NextResponse.json({ success: false, error: "Invalid rider id" }, { status: 400 }) };
  }

  const systemUser = await getSystemUserByEmail(user.email ?? "");
  if (!systemUser?.id) {
    return { error: NextResponse.json({ success: false, error: "Agent not found in system users." }, { status: 403 }) };
  }

  const db = getDb();
  return { db, riderId, systemUserId: systemUser.id };
}

/** GET – current freeze status and latest action with agent email */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const resolved = await getAuthAndRider(request, await params);
  if ("error" in resolved) return resolved.error;
  const { db, riderId } = resolved;

  const [wallet] = await db
    .select()
    .from(riderWallet)
    .where(eq(riderWallet.riderId, riderId))
    .limit(1);

  const [latest] = await db
    .select({
      id: riderWalletFreezeHistory.id,
      action: riderWalletFreezeHistory.action,
      reason: riderWalletFreezeHistory.reason,
      createdAt: riderWalletFreezeHistory.createdAt,
      performedByEmail: systemUsers.email,
      performedByName: systemUsers.fullName,
    })
    .from(riderWalletFreezeHistory)
    .leftJoin(
      systemUsers,
      eq(riderWalletFreezeHistory.performedBySystemUserId, systemUsers.id)
    )
    .where(eq(riderWalletFreezeHistory.riderId, riderId))
    .orderBy(desc(riderWalletFreezeHistory.createdAt))
    .limit(1);

  return NextResponse.json({
    success: true,
    data: {
      isFrozen: wallet?.isFrozen ?? false,
      frozenAt: wallet?.frozenAt ?? null,
      frozenBySystemUserId: wallet?.frozenBySystemUserId ?? null,
      latestAction: latest
        ? {
            action: latest.action,
            reason: latest.reason,
            createdAt: latest.createdAt,
            performedByEmail: latest.performedByEmail ?? null,
            performedByName: latest.performedByName ?? null,
          }
        : null,
    },
  });
}

/** POST – freeze or unfreeze wallet (requires UPDATE on at least one RIDER_ACTIONS_* – same as penalty/refund access) */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const resolved = await getAuthAndRider(request, await params);
  if ("error" in resolved) return resolved.error;
  const { db, riderId, systemUserId } = resolved;

  const supabase = await createServerSupabaseClient();
  const { data: { user: authUser } } = await supabase.auth.getUser();
  if (!authUser?.email) {
    return NextResponse.json({ success: false, error: "Not authenticated" }, { status: 401 });
  }
  const userIsSuperAdmin = await isSuperAdmin(authUser.id, authUser.email);
  const canFreeze =
    userIsSuperAdmin ||
    (await canPerformRiderActionAnyService(authUser.id, authUser.email, "UPDATE"));
  if (!canFreeze) {
    return NextResponse.json(
      { success: false, error: "Insufficient permissions. Rider action (penalty/refund) access required to freeze or unfreeze wallet." },
      { status: 403 }
    );
  }

  let body: { action?: string; reason?: string } = {};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { success: false, error: "Invalid JSON body" },
      { status: 400 }
    );
  }

  const action = body.action === "freeze" ? "freeze" : body.action === "unfreeze" ? "unfreeze" : null;
  if (!action) {
    return NextResponse.json(
      { success: false, error: "Body must include action: 'freeze' or 'unfreeze'" },
      { status: 400 }
    );
  }

  const [wallet] = await db
    .select()
    .from(riderWallet)
    .where(eq(riderWallet.riderId, riderId))
    .limit(1);

  if (!wallet) {
    return NextResponse.json(
      { success: false, error: "Rider wallet not found" },
      { status: 404 }
    );
  }

  if (action === "freeze" && wallet.isFrozen) {
    return NextResponse.json(
      { success: false, error: "Wallet is already frozen" },
      { status: 400 }
    );
  }
  if (action === "unfreeze" && !wallet.isFrozen) {
    return NextResponse.json(
      { success: false, error: "Wallet is not frozen" },
      { status: 400 }
    );
  }

  const reason = typeof body.reason === "string" ? body.reason.trim() || null : null;

  await db.insert(riderWalletFreezeHistory).values({
    riderId,
    action,
    performedBySystemUserId: systemUserId,
    reason,
  });

  if (action === "freeze") {
    await db
      .update(riderWallet)
      .set({
        isFrozen: true,
        frozenAt: new Date(),
        frozenBySystemUserId: systemUserId,
        lastUpdatedAt: new Date(),
      })
      .where(eq(riderWallet.riderId, riderId));
  } else {
    await db
      .update(riderWallet)
      .set({
        isFrozen: false,
        frozenAt: null,
        frozenBySystemUserId: null,
        lastUpdatedAt: new Date(),
      })
      .where(eq(riderWallet.riderId, riderId));
  }

  return NextResponse.json({
    success: true,
    data: { action, isFrozen: action === "freeze" },
  });
}
