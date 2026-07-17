/**
 * GET /api/merchant/subscription-history?storeId=GMMC1015&limit=25&offset=0
 *
 * Combined subscription lifecycle for a merchant store — purchases +
 * refunds merged into one date-sorted event stream.
 *
 * Merchant-facing view: the refund `actor_*` columns are NEVER selected
 * from Postgres and therefore cannot leak to the client. Matches the
 * existing Supabase-native pattern used elsewhere in partnersite.
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { withRouteTimeout } from "@/lib/route-timeout";

const supabaseUrl =
  process.env.NEXT_PUBLIC_SUPABASE_URL || "https://placeholder.supabase.co";
const supabaseServiceKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY || "placeholder-service-role-key";

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
    return await withRouteTimeout("merchant.subscription-history.get", 15_000, async () => {
      const storeIdParam =
        req.nextUrl.searchParams.get("storeId") ??
        req.nextUrl.searchParams.get("store_id");
      if (!storeIdParam?.trim()) {
        return NextResponse.json({ error: "storeId is required" }, { status: 400 });
      }

      const limitParam = Number(req.nextUrl.searchParams.get("limit") ?? "25");
      const offsetParam = Number(req.nextUrl.searchParams.get("offset") ?? "0");
      const limit = Math.max(1, Math.min(100, Number.isFinite(limitParam) ? limitParam : 25));
      const offset = Math.max(0, Number.isFinite(offsetParam) ? offsetParam : 0);

      const db = getDb();
      const merchantStoreId = await resolveStoreInternalId(db, storeIdParam.trim());
      if (merchantStoreId === null) {
        return NextResponse.json({ error: "Store not found" }, { status: 404 });
      }

      // Two queries in parallel: purchases + refunds. actor_* NEVER selected.
      const [purchasesRes, refundsRes] = await Promise.all([
        db
          .from("subscription_payments")
          .select(
            [
              "id",
              "subscription_id",
              "plan_id",
              "amount",
              "total_paise",
              "gst_percent_applied",
              "gst_amount_paise",
              "payment_gateway",
              "payment_gateway_id",
              "payment_status",
              "payment_date",
              "billing_period_start",
              "billing_period_end",
              "notes",
            ].join(",")
          )
          .eq("store_id", merchantStoreId)
          .order("payment_date", { ascending: false }),
        db
          .from("merchant_subscription_refunds")
          .select(
            [
              "id",
              "payment_id",
              "subscription_id",
              "plan_id",
              "gateway",
              "amount",
              "total_paise",
              "currency",
              "refund_reference",
              "wallet_ledger_id",
              "razorpay_refund_id",
              "razorpay_payment_id",
              "status",
              "reason",
              "initiated_at",
              "completed_at",
              "failed_at",
              "failure_reason",
            ].join(",")
          )
          .eq("store_id", merchantStoreId)
          .order("initiated_at", { ascending: false }),
      ]);

      if (purchasesRes.error) {
        return NextResponse.json(
          { error: purchasesRes.error.message || "purchases query failed" },
          { status: 500 }
        );
      }

      // Refunds table may not exist on environments where migration 0420
      // hasn't run — degrade gracefully to an empty refunds list.
      const refundsRaw =
        refundsRes.error &&
        String((refundsRes.error as { code?: string }).code) === "42P01"
          ? []
          : refundsRes.data ?? [];

      // Plan-name lookup for both event types in a single follow-up query.
      const planIds = Array.from(
        new Set(
          [
            ...(purchasesRes.data ?? []).map((r) => (r as { plan_id?: number | null }).plan_id),
            ...refundsRaw.map((r) => (r as unknown as { plan_id?: number | null }).plan_id),
          ].filter((x): x is number => x != null)
        )
      );
      const planLookup: Record<number, { plan_name: string; plan_code: string }> = {};
      if (planIds.length > 0) {
        const { data: plans } = await db
          .from("merchant_plans")
          .select("id, plan_name, plan_code")
          .in("id", planIds);
        (plans ?? []).forEach((p) => {
          const id = Number((p as { id: number }).id);
          planLookup[id] = {
            plan_name: String((p as { plan_name?: string }).plan_name ?? ""),
            plan_code: String((p as { plan_code?: string }).plan_code ?? ""),
          };
        });
      }

      const purchases = (purchasesRes.data ?? []).map((p) => {
        const row = p as unknown as Record<string, unknown>;
        const planId = row.plan_id != null ? Number(row.plan_id) : null;
        const eventAt = row.payment_date
          ? new Date(String(row.payment_date)).toISOString()
          : new Date(0).toISOString();
        return {
          eventType: "PURCHASE" as const,
          eventAt,
          id: Number(row.id),
          subscriptionId: Number(row.subscription_id),
          planId,
          planName: planId != null ? planLookup[planId]?.plan_name ?? null : null,
          planCode: planId != null ? planLookup[planId]?.plan_code ?? null : null,
          amount: Number(row.amount ?? 0),
          totalPaise: Number(row.total_paise ?? 0),
          gstPercent: row.gst_percent_applied != null ? Number(row.gst_percent_applied) : 0,
          gstAmountPaise: row.gst_amount_paise != null ? Number(row.gst_amount_paise) : 0,
          gateway: String(row.payment_gateway ?? "").toUpperCase(),
          gatewayId: row.payment_gateway_id != null ? String(row.payment_gateway_id) : null,
          status: String(row.payment_status ?? "").toUpperCase(),
          billingPeriodStart: row.billing_period_start ? String(row.billing_period_start) : null,
          billingPeriodEnd: row.billing_period_end ? String(row.billing_period_end) : null,
          notes: row.notes != null ? String(row.notes) : null,
        };
      });

      const refunds = refundsRaw.map((r) => {
        const row = r as unknown as Record<string, unknown>;
        const planId = row.plan_id != null ? Number(row.plan_id) : null;
        return {
          eventType: "REFUND" as const,
          eventAt: new Date(String(row.initiated_at)).toISOString(),
          id: Number(row.id),
          paymentId: Number(row.payment_id),
          subscriptionId: Number(row.subscription_id),
          planId,
          planName: planId != null ? planLookup[planId]?.plan_name ?? null : null,
          planCode: planId != null ? planLookup[planId]?.plan_code ?? null : null,
          gateway: String(row.gateway).toUpperCase() as "WALLET" | "RAZORPAY",
          amount: Number(row.amount ?? 0),
          totalPaise: Number(row.total_paise ?? 0),
          currency: String(row.currency ?? "INR"),
          status: String(row.status).toUpperCase() as "PENDING" | "COMPLETED" | "FAILED",
          reason: String(row.reason ?? ""),
          refundReference: String(row.refund_reference ?? ""),
          walletLedgerId: row.wallet_ledger_id != null ? Number(row.wallet_ledger_id) : null,
          razorpayRefundId:
            row.razorpay_refund_id != null ? String(row.razorpay_refund_id) : null,
          razorpayPaymentId:
            row.razorpay_payment_id != null ? String(row.razorpay_payment_id) : null,
          initiatedAt: String(row.initiated_at),
          completedAt: row.completed_at ? String(row.completed_at) : null,
          failedAt: row.failed_at ? String(row.failed_at) : null,
          failureReason: row.failure_reason != null ? String(row.failure_reason) : null,
        };
      });

      const merged = [...purchases, ...refunds].sort((a, b) => {
        const cmp = new Date(b.eventAt).getTime() - new Date(a.eventAt).getTime();
        if (cmp !== 0) return cmp;
        if (a.eventType !== b.eventType) return a.eventType === "REFUND" ? -1 : 1;
        return b.id - a.id;
      });

      const total = merged.length;
      const page = merged.slice(offset, offset + limit);

      return NextResponse.json({
        success: true,
        items: page,
        total,
        limit,
        offset,
        hasMore: offset + page.length < total,
      });
    });
  } catch (e) {
    console.error("[GET /api/merchant/subscription-history]", e);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
