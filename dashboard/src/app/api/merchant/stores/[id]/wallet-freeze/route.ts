/**
 * GET  – merchant store wallet freeze status
 * POST – freeze or unfreeze the store wallet (body: { action, reason })
 *
 * Wallet ownership is per store (`merchant_wallet.merchant_store_id`).
 * Store open/closed is not changed by freeze.
 */
import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getSql } from "@/lib/db/client";
import { hasDashboardAccessByAuth, isSuperAdmin } from "@/lib/permissions/engine";
import { resolveMerchantListAreaManagerId } from "@/lib/merchants/resolve-merchant-list-scope";
import { getSystemUserByEmail } from "@/lib/auth/user-mapping";
import { getMerchantStoreById } from "@/lib/db/operations/merchant-stores";

export const runtime = "nodejs";

async function authorizeStore(request: NextRequest, storeId: number) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user?.email) {
    return { error: NextResponse.json({ success: false, error: "Not authenticated" }, { status: 401 }) };
  }

  const superAdmin = await isSuperAdmin(user.id, user.email);
  const allowed =
    superAdmin || (await hasDashboardAccessByAuth(user.id, user.email, "MERCHANT"));
  if (!allowed) {
    return {
      error: NextResponse.json(
        { success: false, error: "Merchant dashboard access required" },
        { status: 403 },
      ),
    };
  }

  const areaManagerId = await resolveMerchantListAreaManagerId({
    supabaseAuthId: user.id,
    email: user.email,
  });
  const store = await getMerchantStoreById(storeId, areaManagerId);
  if (!store) {
    return { error: NextResponse.json({ success: false, error: "Store not found" }, { status: 404 }) };
  }

  const systemUser = await getSystemUserByEmail(user.email);
  if (!systemUser?.id) {
    return {
      error: NextResponse.json({ success: false, error: "Agent not found in system users." }, { status: 403 }),
    };
  }

  return { storeId, systemUserId: systemUser.id };
}

async function loadWalletFreeze(sql: ReturnType<typeof getSql>, storeId: number) {
  const [wallet] = await sql`
    SELECT
      w.id,
      w.status,
      w.frozen_reason,
      w.frozen_at,
      w.frozen_by_system_user_id,
      su.email AS frozen_by_email,
      su.full_name AS frozen_by_name
    FROM merchant_wallet w
    LEFT JOIN system_users su ON su.id = w.frozen_by_system_user_id
    WHERE w.merchant_store_id = ${storeId}
    LIMIT 1
  `;

  const [latest] = await sql`
    SELECT
      l.previous_status,
      l.new_status,
      l.reason,
      l.created_at,
      su.email AS performed_by_email,
      su.full_name AS performed_by_name
    FROM payment_wallet_freeze_logs l
    JOIN merchant_wallet w ON w.id = l.wallet_id
    LEFT JOIN system_users su ON su.id = l.frozen_by_system_user_id
    WHERE w.merchant_store_id = ${storeId}
    ORDER BY l.created_at DESC
    LIMIT 1
  `;

  const status = String((wallet as { status?: unknown } | undefined)?.status ?? "ACTIVE").toUpperCase();
  const isFrozen = status === "FROZEN";
  const frozenReason = (wallet as { frozen_reason?: string | null } | undefined)?.frozen_reason ?? null;
  const frozenAt = (wallet as { frozen_at?: Date | string | null } | undefined)?.frozen_at ?? null;
  const latestRow = latest as
    | {
        previous_status?: string | null;
        new_status?: string;
        reason?: string | null;
        created_at?: Date | string;
        performed_by_email?: string | null;
        performed_by_name?: string | null;
      }
    | undefined;

  return {
    walletId: wallet ? Number((wallet as { id: number }).id) : null,
    isFrozen,
    freezeReason: isFrozen ? frozenReason : null,
    frozenAt: isFrozen && frozenAt ? new Date(frozenAt).toISOString() : null,
    frozenByEmail: isFrozen
      ? ((wallet as { frozen_by_email?: string | null }).frozen_by_email ?? null)
      : null,
    frozenByName: isFrozen
      ? ((wallet as { frozen_by_name?: string | null }).frozen_by_name ?? null)
      : null,
    status,
    latestAction: latestRow
      ? {
          action: String(latestRow.new_status ?? "").toUpperCase() === "FROZEN" ? "freeze" : "unfreeze",
          previousState: latestRow.previous_status ?? null,
          newState: latestRow.new_status ?? null,
          reason: latestRow.reason ?? null,
          createdAt:
            latestRow.created_at instanceof Date
              ? latestRow.created_at.toISOString()
              : latestRow.created_at
                ? String(latestRow.created_at)
                : null,
          performedByEmail: latestRow.performed_by_email ?? null,
          performedByName: latestRow.performed_by_name ?? null,
        }
      : null,
  };
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const storeId = parseInt((await params).id, 10);
  if (!Number.isFinite(storeId)) {
    return NextResponse.json({ success: false, error: "Invalid store id" }, { status: 400 });
  }
  const auth = await authorizeStore(request, storeId);
  if ("error" in auth) return auth.error;

  try {
    const data = await loadWalletFreeze(getSql(), storeId);
    return NextResponse.json({ success: true, data });
  } catch (err) {
    console.error("[GET /api/merchant/stores/[id]/wallet-freeze]", err);
    return NextResponse.json({ success: false, error: "Failed to load wallet freeze status" }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const storeId = parseInt((await params).id, 10);
  if (!Number.isFinite(storeId)) {
    return NextResponse.json({ success: false, error: "Invalid store id" }, { status: 400 });
  }
  const auth = await authorizeStore(request, storeId);
  if ("error" in auth) return auth.error;
  const { systemUserId } = auth;

  let body: { action?: string; reason?: string } = {};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, error: "Invalid JSON body" }, { status: 400 });
  }

  const action = body.action === "freeze" ? "freeze" : body.action === "unfreeze" ? "unfreeze" : null;
  if (!action) {
    return NextResponse.json(
      { success: false, error: "Body must include action: 'freeze' or 'unfreeze'" },
      { status: 400 },
    );
  }

  const reason = typeof body.reason === "string" ? body.reason.trim() : "";
  if (action === "freeze" && !reason) {
    return NextResponse.json({ success: false, error: "Freeze reason is required" }, { status: 400 });
  }

  const sql = getSql();
  try {
    await sql.begin(async (tx) => {
      let walletId: number | null = null;
      const [existing] = await tx`
        SELECT id, status FROM merchant_wallet
        WHERE merchant_store_id = ${storeId}
        FOR UPDATE
      `;
      if (existing) {
        walletId = Number((existing as { id: number }).id);
      } else {
        const [created] = await tx`
          INSERT INTO merchant_wallet (merchant_store_id, merchant_parent_id)
          SELECT ms.id, ms.parent_id FROM merchant_stores ms WHERE ms.id = ${storeId}
          ON CONFLICT (merchant_store_id) DO UPDATE SET updated_at = NOW()
          RETURNING id, status
        `;
        walletId = created ? Number((created as { id: number }).id) : null;
      }
      if (!walletId) {
        throw Object.assign(new Error("Merchant wallet not found"), { status: 404 });
      }

      const [locked] = await tx`
        SELECT id, status FROM merchant_wallet WHERE id = ${walletId} FOR UPDATE
      `;
      const status = String((locked as { status?: unknown } | undefined)?.status ?? "ACTIVE").toUpperCase();
      if (action === "freeze" && status === "FROZEN") {
        throw Object.assign(new Error("Wallet is already frozen"), { status: 400 });
      }
      if (action === "unfreeze" && status !== "FROZEN") {
        throw Object.assign(new Error("Wallet is not frozen"), { status: 400 });
      }

      const prev = status;
      if (action === "freeze") {
        await tx`
          UPDATE merchant_wallet
          SET status = 'FROZEN',
              frozen_reason = ${reason},
              frozen_at = NOW(),
              frozen_by_system_user_id = ${systemUserId},
              updated_at = NOW()
          WHERE id = ${walletId}
        `;
        await tx`
          INSERT INTO payment_wallet_freeze_logs (
            party_type, wallet_id, previous_status, new_status, reason, frozen_by_system_user_id
          ) VALUES (
            'MERCHANT', ${walletId}, ${prev}::wallet_status_type, 'FROZEN', ${reason}, ${systemUserId}
          )
        `;
      } else {
        await tx`
          UPDATE merchant_wallet
          SET status = 'ACTIVE',
              frozen_reason = NULL,
              frozen_at = NULL,
              frozen_by_system_user_id = NULL,
              updated_at = NOW()
          WHERE id = ${walletId}
        `;
        await tx`
          INSERT INTO payment_wallet_freeze_logs (
            party_type, wallet_id, previous_status, new_status, reason, frozen_by_system_user_id
          ) VALUES (
            'MERCHANT', ${walletId}, ${prev}::wallet_status_type, 'ACTIVE',
            ${reason || "Unfrozen by admin"}, ${systemUserId}
          )
        `;
      }
    });
  } catch (err) {
    const status = Number((err as { status?: unknown })?.status) || 500;
    const message = err instanceof Error ? err.message : "Wallet freeze failed";
    if (status === 400 || status === 404) {
      return NextResponse.json({ success: false, error: message }, { status });
    }
    console.error("[POST /api/merchant/stores/[id]/wallet-freeze]", err);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }

  void (async () => {
    try {
      const { backendFetch } = await import("@/lib/notif-backend");
      await backendFetch("/v1/internal/wallet-freeze-notify", {
        method: "POST",
        body: JSON.stringify({
          party: "merchant",
          action,
          storeId,
          reason: reason || null,
        }),
      });
    } catch {
      /* notify is best-effort */
    }
  })();

  const data = await loadWalletFreeze(sql, storeId).catch(() => ({
    isFrozen: action === "freeze",
    freezeReason: action === "freeze" ? reason : null,
  }));

  return NextResponse.json({
    success: true,
    data: { action, ...data },
  });
}
