/**
 * GET /api/merchant/subscription-refunds?storeId=GMMC1015&limit=20&offset=0
 *
 * Returns refund history for a merchant's store. Merchant-facing view:
 * the `actor_*` columns are NEVER included in the response — agent
 * identity is admin-only (Control Dashboard) by product policy.
 *
 * Matches the existing Supabase-native pattern used by /api/merchant/wallet
 * (queries Supabase directly rather than proxying to the backend).
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { withRouteTimeout } from "@/lib/route-timeout";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://placeholder.supabase.co";
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "placeholder-service-role-key";

function getDb() {
  return createClient(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

async function resolveStoreInternalId(
  db: ReturnType<typeof getDb>,
  storeId: string
): Promise<number | null> {
  const { data, error } = await db
    .from("merchant_stores")
    .select("id")
    .eq("store_id", storeId)
    .single();
  if (error || !data) return null;
  return data.id as number;
}

export async function GET(req: NextRequest) {
  try {
    return await withRouteTimeout("merchant.subscription-refunds.get", 15_000, async () => {
      const storeIdParam =
        req.nextUrl.searchParams.get("storeId") ?? req.nextUrl.searchParams.get("store_id");
      if (!storeIdParam?.trim()) {
        return NextResponse.json({ error: "storeId is required" }, { status: 400 });
      }

      const limitParam = Number(req.nextUrl.searchParams.get("limit") ?? "20");
      const offsetParam = Number(req.nextUrl.searchParams.get("offset") ?? "0");
      const limit = Math.max(1, Math.min(100, Number.isFinite(limitParam) ? limitParam : 20));
      const offset = Math.max(0, Number.isFinite(offsetParam) ? offsetParam : 0);

      const db = getDb();
      const merchantStoreId = await resolveStoreInternalId(db, storeIdParam.trim());
      if (merchantStoreId === null) {
        return NextResponse.json({ error: "Store not found" }, { status: 404 });
      }

      const { data, error, count } = await db
        .from("merchant_subscription_refunds")
        // Explicit column list — do NOT select actor_* to keep agent identity
        // out of the response. Server-side stripping so a client can never
        // learn who processed their refund.
        .select(
          [
            "id",
            "payment_id",
            "subscription_id",
            "store_id",
            "plan_id",
            "gateway",
            "amount",
            "total_paise",
            "currency",
            "refund_reference",
            "razorpay_refund_id",
            "status",
            "reason",
            "initiated_at",
            "completed_at",
            "failed_at",
            "failure_reason",
          ].join(","),
          { count: "exact" }
        )
        .eq("store_id", merchantStoreId)
        .order("initiated_at", { ascending: false })
        .range(offset, offset + limit - 1);

      if (error) {
        // Table missing (migration 0420 not applied) returns 42P01 — surface a
        // clean empty response instead of a 500 so the UI degrades gracefully.
        if (String((error as { code?: string }).code) === "42P01") {
          return NextResponse.json({
            success: true,
            items: [],
            total: 0,
            limit,
            offset,
            hasMore: false,
            notice: "Refund audit table not yet migrated on this environment.",
          });
        }
        return NextResponse.json({ error: error.message || "query failed" }, { status: 500 });
      }

      // Prefer purchase-time plan name from the linked payment snapshot.
      const paymentIds = Array.from(
        new Set(
          (data ?? [])
            .map((r) => (r as { payment_id?: number | null }).payment_id)
            .filter((x): x is number => x != null)
        )
      );
      const snapByPaymentId: Record<
        number,
        { plan_name: string | null; plan_code: string | null }
      > = {};
      if (paymentIds.length > 0) {
        const { data: pays } = await db
          .from("subscription_payments")
          .select("id, plan_name_snapshot, plan_code_snapshot, plan_id")
          .in("id", paymentIds);
        (pays ?? []).forEach((p) => {
          const row = p as {
            id: number;
            plan_name_snapshot?: string | null;
            plan_code_snapshot?: string | null;
          };
          snapByPaymentId[Number(row.id)] = {
            plan_name: row.plan_name_snapshot ? String(row.plan_name_snapshot) : null,
            plan_code: row.plan_code_snapshot ? String(row.plan_code_snapshot) : null,
          };
        });
      }

      const planIds = Array.from(
        new Set(
          (data ?? [])
            .map((r) => (r as { plan_id?: number | null }).plan_id)
            .filter((x): x is number => x != null)
        )
      );
      let planLookup: Record<number, { plan_name: string; plan_code: string }> = {};
      if (planIds.length > 0) {
        const { data: plans } = await db
          .from("merchant_plans")
          .select("id, plan_name, plan_code")
          .in("id", planIds);
        (plans ?? []).forEach((p) => {
          planLookup[Number((p as { id: number }).id)] = {
            plan_name: String((p as { plan_name?: string }).plan_name ?? ""),
            plan_code: String((p as { plan_code?: string }).plan_code ?? ""),
          };
        });
      }

      const items = (data ?? []).map((r) => {
        const row = r as unknown as Record<string, unknown>;
        const planId = row.plan_id != null ? Number(row.plan_id) : null;
        const paymentId = Number(row.payment_id);
        const snap = snapByPaymentId[paymentId];
        return {
          id: Number(row.id),
          paymentId,
          subscriptionId: Number(row.subscription_id),
          storeId: Number(row.store_id),
          planId,
          planName:
            snap?.plan_name ||
            (planId != null ? planLookup[planId]?.plan_name ?? null : null),
          planCode:
            snap?.plan_code ||
            (planId != null ? planLookup[planId]?.plan_code ?? null : null),
          gateway: String(row.gateway).toUpperCase(),
          amount: Number(row.amount),
          totalPaise: Number(row.total_paise),
          currency: String(row.currency ?? "INR"),
          refundReference: String(row.refund_reference),
          razorpayRefundId: row.razorpay_refund_id != null ? String(row.razorpay_refund_id) : null,
          status: String(row.status).toUpperCase(),
          reason: String(row.reason),
          initiatedAt: String(row.initiated_at),
          completedAt: row.completed_at ? String(row.completed_at) : null,
          failedAt: row.failed_at ? String(row.failed_at) : null,
          failureReason: row.failure_reason != null ? String(row.failure_reason) : null,
        };
      });

      const total = Number(count ?? items.length);
      return NextResponse.json({
        success: true,
        items,
        total,
        limit,
        offset,
        hasMore: offset + items.length < total,
      });
    });
  } catch (e) {
    console.error("[GET /api/merchant/subscription-refunds]", e);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
