/**
 * POST /api/merchant/stores/[id]/delist
 *
 * Body:
 * {
 *   action: 'delist' | 'relist',
 *   delist_type?: 'temporary_delisted' | 'permanently_delisted' | 'compliance_hold',
 *   reason_category?: string,
 *   reason_description?: string
 * }
 *
 * Delist: updates merchant_stores flags and inserts into store_delisting_logs + merchant_store_blocks.
 * Relist: (placeholder) – can be implemented to reverse delist flags using history.
 */
import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { hasDashboardAccessByAuth, isSuperAdmin } from "@/lib/permissions/engine";
import { resolveMerchantListAreaManagerId } from "@/lib/merchants/resolve-merchant-list-scope";
import { getSystemUserByEmail } from "@/lib/auth/user-mapping";
import { getMerchantStoreById, delistMerchantStore, relistMerchantStore, type DelistType } from "@/lib/db/operations/merchant-stores";

export const runtime = "nodejs";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const storeId = parseInt(id, 10);
    if (!Number.isFinite(storeId)) {
      return NextResponse.json({ success: false, error: "Invalid store id" }, { status: 400 });
    }

    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser();
    if (error || !user?.email) {
      return NextResponse.json({ success: false, error: "Not authenticated" }, { status: 401 });
    }

    const superAdmin = await isSuperAdmin(user.id, user.email);
    const allowed =
      superAdmin ||
      (await hasDashboardAccessByAuth(user.id, user.email, "MERCHANT"));
    if (!allowed) {
      return NextResponse.json(
        { success: false, error: "Merchant dashboard access required" },
        { status: 403 }
      );
    }

    const areaManagerId = await resolveMerchantListAreaManagerId({
      supabaseAuthId: user.id,
      email: user.email,
    });

    const store = await getMerchantStoreById(storeId, areaManagerId);
    if (!store) {
      return NextResponse.json({ success: false, error: "Store not found" }, { status: 404 });
    }

    const body = await request.json().catch(() => ({}));
    const action = body?.action as "delist" | "relist" | undefined;
    if (!action || !["delist", "relist"].includes(action)) {
      return NextResponse.json({ success: false, error: "Invalid action" }, { status: 400 });
    }

    const systemUser = await getSystemUserByEmail(user.email);
    const actorUserId = systemUser?.id ?? 0;
    const actorRole = superAdmin ? "admin" : "agent";

    if (action === "delist") {
      const delistType = body?.delist_type as DelistType | undefined;
      const reasonCategory = String(body?.reason_category ?? "").trim();
      const reasonDescription = String(body?.reason_description ?? "").trim();

      if (!delistType || !["temporary_delisted", "permanently_delisted", "compliance_hold"].includes(delistType)) {
        return NextResponse.json({ success: false, error: "Valid delist_type is required" }, { status: 400 });
      }
      if (!reasonCategory) {
        return NextResponse.json({ success: false, error: "Reason category is required" }, { status: 400 });
      }
      if (!reasonDescription || reasonDescription.length < 10) {
        return NextResponse.json({ success: false, error: "Reason description must be at least 10 characters" }, { status: 400 });
      }

      await delistMerchantStore({
        storeId,
        delistType,
        reasonCategory,
        reasonDescription,
        actorUserId,
        actorRole,
      });

      void (async () => {
        try {
          const { broadcastMerchantStoreDelist } = await import(
            "@/lib/merchant-store-delist-broadcast"
          );
          await broadcastMerchantStoreDelist({
            storeId,
            action: "delist",
            isDelisted: true,
          });
        } catch {
          /* broadcast is best-effort */
        }
      })();

      void (async () => {
        try {
          const { backendFetch } = await import("@/lib/notif-backend");
          await backendFetch("/v1/internal/store-delist-notify", {
            method: "POST",
            body: JSON.stringify({
              storeId,
              action: "delist",
              reason: reasonDescription || null,
            }),
          });
        } catch {
          /* notify is best-effort */
        }
      })();

      return NextResponse.json({ success: true, action: "delist" });
    }

    // Relist flow
    const delisted =
      store.delisted_at != null || String(store.approval_status || "").toUpperCase() === "DELISTED";
    if (!delisted) {
      return NextResponse.json(
        { success: false, error: "Store is not delisted." },
        { status: 400 }
      );
    }

    const relistReason = String(body?.reason_description ?? "").trim() || null;

    await relistMerchantStore({
      storeId,
      actorUserId,
      actorRole,
      relistReason,
    });

    void (async () => {
      try {
        const { broadcastMerchantStoreDelist } = await import(
          "@/lib/merchant-store-delist-broadcast"
        );
        await broadcastMerchantStoreDelist({
          storeId,
          action: "relist",
          isDelisted: false,
        });
      } catch {
        /* broadcast is best-effort */
      }
    })();

    void (async () => {
      try {
        const { backendFetch } = await import("@/lib/notif-backend");
        await backendFetch("/v1/internal/store-delist-notify", {
          method: "POST",
          body: JSON.stringify({
            storeId,
            action: "relist",
            reason: relistReason,
          }),
        });
      } catch {
        /* notify is best-effort */
      }
    })();

    return NextResponse.json({ success: true, action: "relist" });
  } catch (e) {
    console.error("[POST /api/merchant/stores/[id]/delist]", e);
    return NextResponse.json(
      { success: false, error: "Internal error" },
      { status: 500 }
    );
  }
}

