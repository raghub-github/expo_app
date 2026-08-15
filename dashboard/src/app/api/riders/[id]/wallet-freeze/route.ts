/**
 * GET  – current wallet freeze status + latest action with agent email
 * POST – freeze or unfreeze wallet (body: { action: 'freeze'|'unfreeze', reason?: string })
 */
import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getDb, getSql } from "@/lib/db/client";
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
      freezeReason: wallet?.isFrozen
        ? (wallet.freezeReason ?? latest?.reason ?? null)
        : null,
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
  const { riderId, systemUserId } = resolved;

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

  const reason = typeof body.reason === "string" ? body.reason.trim() : "";
  if (action === "freeze" && !reason) {
    return NextResponse.json(
      { success: false, error: "Freeze reason is required" },
      { status: 400 }
    );
  }

  const sql = getSql();
  try {
    await sql.begin(async (tx) => {
      const [locked] = await tx`
        SELECT is_frozen
        FROM rider_wallet
        WHERE rider_id = ${riderId}
        FOR UPDATE
      `;
      if (!locked) {
        throw Object.assign(new Error("Rider wallet not found"), { status: 404 });
      }
      const frozen = Boolean((locked as { is_frozen?: unknown }).is_frozen);
      if (action === "freeze" && frozen) {
        throw Object.assign(new Error("Wallet is already frozen"), { status: 400 });
      }
      if (action === "unfreeze" && !frozen) {
        throw Object.assign(new Error("Wallet is not frozen"), { status: 400 });
      }

      await tx`
        INSERT INTO rider_wallet_freeze_history (
          rider_id, action, performed_by_system_user_id, reason
        ) VALUES (
          ${riderId}, ${action}, ${systemUserId}, ${reason || null}
        )
      `;

      if (action === "freeze") {
        await tx`
          UPDATE rider_wallet
          SET
            is_frozen = true,
            frozen_at = NOW(),
            frozen_by_system_user_id = ${systemUserId},
            freeze_reason = ${reason},
            last_updated_at = NOW()
          WHERE rider_id = ${riderId}
        `;
      } else {
        await tx`
          UPDATE rider_wallet
          SET
            is_frozen = false,
            frozen_at = NULL,
            frozen_by_system_user_id = NULL,
            freeze_reason = NULL,
            last_updated_at = NOW()
          WHERE rider_id = ${riderId}
        `;
      }
    });
  } catch (err) {
    const status = Number((err as { status?: unknown })?.status) || 500;
    const message = err instanceof Error ? err.message : "Wallet freeze failed";
    if (status === 400 || status === 404) {
      return NextResponse.json({ success: false, error: message }, { status });
    }
    console.error("[POST /api/riders/[id]/wallet-freeze]", err);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }

  void (async () => {
    try {
      const { backendFetch } = await import("@/lib/notif-backend");
      await backendFetch("/v1/internal/wallet-freeze-notify", {
        method: "POST",
        body: JSON.stringify({
          party: "rider",
          action,
          riderId,
          reason: reason || null,
        }),
      });
    } catch {
      /* notify is best-effort */
    }
  })();

  return NextResponse.json({
    success: true,
    data: { action, isFrozen: action === "freeze", freezeReason: action === "freeze" ? reason : null },
  });
}
