/**
 * FLASH_SALE redemption insert + cancel/refund restore.
 * FOOD: unique (customer, store, offer) while reserved/consumed.
 * Ride/Parcel (store_id NULL): unique (customer, offer).
 */

import { and, eq, inArray } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { billingPlatformOffers, flashSaleRedemptions } from "../../db/schema.js";
import { FLASH_SALE_KIND, FLASH_SALE_UNAVAILABLE, FLASH_SALE_ALREADY_USED, classifyFlashSaleInsertConflict, shouldRestoreFlashSaleRedemption } from "./flashSale.js";
import {
  offerLedgerOrderPredicate,
  parseOfferOrderNumericPk,
  resolveOfferOrderKeys,
} from "./offerOrderKeys.js";
import { recordPlatformOfferUsageAtPlacement } from "./platformOfferUsage.service.js";

export class FlashSaleRedemptionError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
    this.name = "FlashSaleRedemptionError";
  }
}

export type RecordFlashSaleRedemptionInput = {
  platformOfferId: number;
  customerId: number;
  orderId: string | number;
  /** Prefer orders_core.id when known. Do not strip digits from GM/GMF public ids. */
  orderPk?: number | null;
  serviceType: string;
  storeId?: number | null;
  itemIds?: string[];
  originalItemPrice?: number | null;
  flashSalePrice?: number | null;
  subsidyAmount: number;
  campaignBudgetTotal?: number | null;
  consumeMode?: string | null;
  orderSaleAmount?: number | null;
  snapshot?: Record<string, unknown>;
};

export async function recordFlashSaleRedemptionAtPlacement(
  tx: PostgresJsDatabase<Record<string, unknown>>,
  input: RecordFlashSaleRedemptionInput
): Promise<void> {
  const offerId = input.platformOfferId;
  const customerId = input.customerId;
  if (!(offerId > 0) || !(customerId > 0)) {
    throw new FlashSaleRedemptionError(FLASH_SALE_UNAVAILABLE, "Flash Sale redemption is invalid.");
  }
  const orderPk =
    input.orderPk != null && Number.isFinite(input.orderPk) && input.orderPk > 0
      ? Math.floor(input.orderPk)
      : parseOfferOrderNumericPk(input.orderId);
  const orderIdText = String(input.orderId ?? "").trim() || null;
  const subsidy = Math.max(0, Number(input.subsidyAmount) || 0);
  const now = new Date();
  const mode = String(input.consumeMode ?? "ON_PLACED").toUpperCase();
  const status = mode === "ON_DELIVERED" ? "reserved" : "consumed";
  const idempotencyKey = `${offerId}:${orderPk ?? orderIdText ?? ""}`;

  try {
    await tx.insert(flashSaleRedemptions).values({
      platformOfferId: offerId,
      offerKind: FLASH_SALE_KIND,
      serviceType: String(input.serviceType ?? "FOOD").toUpperCase(),
      storeId: input.storeId != null && input.storeId > 0 ? input.storeId : null,
      itemIds: input.itemIds ?? [],
      customerId,
      orderId: orderPk,
      orderIdText,
      originalItemPrice: input.originalItemPrice != null ? String(input.originalItemPrice) : null,
      flashSalePrice: input.flashSalePrice != null ? String(input.flashSalePrice) : null,
      subsidyAmount: String(subsidy),
      campaignBudgetTotal:
        input.campaignBudgetTotal != null ? String(input.campaignBudgetTotal) : null,
      consumedBudget: status === "consumed" ? String(subsidy) : "0",
      status,
      idempotencyKey,
      snapshotJson: input.snapshot ?? {},
      appliedAt: now,
      consumedAt: status === "consumed" ? now : null,
    } as never);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const kind = classifyFlashSaleInsertConflict(msg);
    if (kind === "idempotent") return;
    if (kind === "already_redeemed" || /duplicate key/i.test(msg)) {
      throw new FlashSaleRedemptionError(
        FLASH_SALE_ALREADY_USED,
        "You have already used this Flash Sale."
      );
    }
    throw err;
  }

  const usage = await recordPlatformOfferUsageAtPlacement(tx, {
    platformOfferId: offerId,
    customerId,
    orderId: input.orderId,
    orderPk,
    discountAmount: subsidy,
    consumeMode: input.consumeMode,
    orderSaleAmount: input.orderSaleAmount,
  });

  if (!usage.ok) {
    await tx
      .update(flashSaleRedemptions)
      .set({
        status: "cancelled",
        cancelledAt: now,
        updatedAt: now,
      })
      .where(
        and(
          eq(flashSaleRedemptions.platformOfferId, offerId),
          orderPk
            ? eq(flashSaleRedemptions.orderId, orderPk)
            : eq(flashSaleRedemptions.orderIdText, orderIdText ?? "")
        )
      );
    throw new FlashSaleRedemptionError(
      FLASH_SALE_UNAVAILABLE,
      usage.status === "budget_exhausted"
        ? "This Flash Sale is out of budget."
        : "This Flash Sale is no longer available."
    );
  }
}

export async function releaseFlashSaleRedemptionsOnCancelOrRefund(
  db: PostgresJsDatabase<Record<string, unknown>>,
  orderId: string | number,
  nextStatus: "cancelled" | "refunded",
  orderPkHint?: number | null
): Promise<void> {
  const keys = await resolveOfferOrderKeys(db, orderId, orderPkHint);
  if (keys.pks.length === 0 && keys.texts.length === 0) return;
  const now = new Date();

  const rows = await db
    .select({
      redemption: flashSaleRedemptions,
      restoreOnCancel: billingPlatformOffers.restoreOnCancel,
      restoreOnRefund: billingPlatformOffers.restoreOnRefund,
    })
    .from(flashSaleRedemptions)
    .innerJoin(
      billingPlatformOffers,
      eq(billingPlatformOffers.id, flashSaleRedemptions.platformOfferId)
    )
    .where(
      and(
        inArray(flashSaleRedemptions.status, ["reserved", "consumed"]),
        offerLedgerOrderPredicate(
          flashSaleRedemptions.orderId,
          flashSaleRedemptions.orderIdText,
          keys
        )
      )
    );

  for (const row of rows) {
    const allow = shouldRestoreFlashSaleRedemption({
      nextStatus,
      restoreOnCancel: row.restoreOnCancel,
      restoreOnRefund: row.restoreOnRefund,
    });
    if (!allow) continue;
    await db
      .update(flashSaleRedemptions)
      .set({
        status: nextStatus,
        cancelledAt: nextStatus === "cancelled" ? now : row.redemption.cancelledAt,
        refundedAt: nextStatus === "refunded" ? now : row.redemption.refundedAt,
        consumedBudget: "0",
        updatedAt: now,
      })
      .where(
        and(
          eq(flashSaleRedemptions.id, row.redemption.id),
          inArray(flashSaleRedemptions.status, ["reserved", "consumed"])
        )
      );
  }
}

/**
 * Reopen unique slots for redemptions whose order is already cancelled/refunded
 * when Status Controls allow restore. Repairs rows missed by the old GM-digit match.
 */
async function reconcileStaleFlashSaleRedemptions(
  customerId: number,
  storePk: number
): Promise<void> {
  if (!(customerId > 0) || !(storePk > 0)) return;
  const { getSql } = await import("../../db/client.js");
  const sqlClient = getSql();
  await sqlClient`
    UPDATE flash_sale_redemptions r
    SET
      status = 'cancelled',
      cancelled_at = COALESCE(r.cancelled_at, now()),
      consumed_budget = 0,
      updated_at = now()
    FROM billing_platform_offers o, orders_core oc
    WHERE o.id = r.platform_offer_id
      AND r.customer_id = ${customerId}
      AND r.store_id IS NOT DISTINCT FROM ${storePk}
      AND r.status IN ('reserved', 'consumed')
      AND COALESCE(o.restore_on_cancel, TRUE) = TRUE
      AND (
        oc.id = r.order_id
        OR (r.order_id_text IS NOT NULL AND oc.order_id = r.order_id_text)
        OR (r.order_id_text IS NOT NULL AND oc.formatted_order_id = r.order_id_text)
      )
      AND (
        oc.cancelled_at IS NOT NULL
        OR LOWER(BTRIM(COALESCE(oc.current_status, oc.status::text)))
          IN ('cancelled', 'canceled')
      )
  `;
  await sqlClient`
    UPDATE flash_sale_redemptions r
    SET
      status = 'refunded',
      refunded_at = COALESCE(r.refunded_at, now()),
      consumed_budget = 0,
      updated_at = now()
    FROM billing_platform_offers o, orders_core oc
    WHERE o.id = r.platform_offer_id
      AND r.customer_id = ${customerId}
      AND r.store_id IS NOT DISTINCT FROM ${storePk}
      AND r.status IN ('reserved', 'consumed')
      AND COALESCE(o.restore_on_refund, TRUE) = TRUE
      AND (
        oc.id = r.order_id
        OR (r.order_id_text IS NOT NULL AND oc.order_id = r.order_id_text)
        OR (r.order_id_text IS NOT NULL AND oc.formatted_order_id = r.order_id_text)
      )
      AND LOWER(COALESCE(oc.payment_status::text, ''))
        IN ('refunded', 'partially_refunded')
  `;
}

export async function loadActiveFoodFlashSalesForStore(
  storePk: number,
  customerId?: number | null
): Promise<import("./types.js").PlatformOfferRow[]> {
  const { getSql } = await import("../../db/client.js");
  const sqlClient = getSql();
  const rows = await sqlClient<
    Array<{
      id: number;
      name: string | null;
      coupon_code: string | null;
      offer_kind: string;
      service_type: string;
      merchant_ids: unknown;
      conditions: unknown;
      starts_at: Date | null;
      ends_at: Date | null;
      budget_total: string | null;
      budget_used: string | null;
      max_uses_per_user: number | null;
      max_uses_total: number | null;
      funding_mode: string;
      promo_config: unknown;
    }>
  >`
    SELECT
      id,
      name,
      coupon_code,
      offer_kind,
      service_type,
      merchant_ids,
      conditions,
      starts_at,
      ends_at,
      budget_total::text AS budget_total,
      budget_used::text AS budget_used,
      max_uses_per_user,
      max_uses_total,
      funding_mode,
      promo_config
    FROM billing_platform_offers
    WHERE is_active = TRUE
      AND COALESCE(is_hidden, FALSE) = FALSE
      AND UPPER(offer_kind) = 'FLASH_SALE'
      AND UPPER(service_type) IN ('FOOD', 'ALL')
  `;

  const now = new Date();
  const out = [];
  for (const r of rows) {
    const ids = Array.isArray(r.merchant_ids)
      ? r.merchant_ids.map((x) => Number(x)).filter((n) => Number.isInteger(n) && n > 0)
      : [];
    if (!ids.includes(storePk)) continue;
    if (r.starts_at && now < new Date(r.starts_at)) continue;
    if (r.ends_at && now > new Date(r.ends_at)) continue;
    const budgetTotal = r.budget_total != null ? Number(r.budget_total) : null;
    const budgetUsed = r.budget_used != null ? Number(r.budget_used) : 0;
    if (budgetTotal != null && budgetTotal > 0 && budgetUsed + 1e-6 > budgetTotal) continue;
    out.push({
      id: Number(r.id),
      name: r.name,
      couponCode: r.coupon_code,
      offerKind: String(r.offer_kind ?? "FLASH_SALE"),
      serviceType: String(r.service_type ?? "FOOD"),
      merchantIds: ids,
      conditions:
        r.conditions && typeof r.conditions === "object" && !Array.isArray(r.conditions)
          ? (r.conditions as Record<string, unknown>)
          : {},
      startsAt: r.starts_at ? new Date(r.starts_at) : null,
      endsAt: r.ends_at ? new Date(r.ends_at) : null,
      budgetTotal: budgetTotal != null && Number.isFinite(budgetTotal) ? budgetTotal : null,
      budgetUsed: Number.isFinite(budgetUsed) ? budgetUsed : 0,
      maxUsesPerUser: r.max_uses_per_user,
      maxUsesTotal: r.max_uses_total,
      maxUsesPerDay: null,
      maxUsesPerMonth: null,
      fundingMode: String(r.funding_mode ?? "PLATFORM_ONLY"),
      platformSharePct: 100,
      merchantSharePct: 0,
      maxPlatformContribution: null,
      maxMerchantContribution: null,
      consumeMode: "ON_PLACED",
      promoConfig:
        r.promo_config && typeof r.promo_config === "object" && !Array.isArray(r.promo_config)
          ? (r.promo_config as Record<string, unknown>)
          : {},
      discountType: "FIXED",
      valueNumeric: null,
      deliveryDiscountType: null,
      deliveryDiscountValue: null,
      offerAudience: "CUSTOMER",
      targetScope: "MERCHANT",
      geoLevel: null,
      geoIds: [],
      customerSegment: "ALL",
      minOrderAmount: null,
      maxDiscountAmount: null,
      buyQty: null,
      getQty: null,
      isStackable: false,
      exclusionGroup: null,
      restoreOnCancel: true,
      restoreOnRefund: true,
      priority: 0,
      isHidden: false,
    });
  }
  if (customerId != null && customerId > 0 && out.length > 0) {
    const usedSet = await usedFoodFlashOfferIdsForCustomerStore(
      customerId,
      storePk,
      out.map((o) => o.id)
    );
    return out.filter((o) => !usedSet.has(o.id));
  }
  return out;
}

/**
 * FOOD FLASH_SALE offers already reserved/consumed for this customer at this store.
 * Store-scoped: use at store A must not hide the campaign at store B.
 */
export async function usedFoodFlashOfferIdsForCustomerStore(
  customerId: number,
  storePk: number,
  offerIds: number[]
): Promise<Set<number>> {
  const ids = offerIds.filter((n) => Number.isInteger(n) && n > 0);
  if (!(customerId > 0) || !(storePk > 0) || ids.length === 0) return new Set();
  await reconcileStaleFlashSaleRedemptions(customerId, storePk).catch(() => undefined);
  const { getSql } = await import("../../db/client.js");
  const sqlClient = getSql();
  const used = await sqlClient<Array<{ platform_offer_id: number }>>`
    SELECT platform_offer_id::bigint AS platform_offer_id
    FROM flash_sale_redemptions
    WHERE customer_id = ${customerId}
      AND status IN ('reserved', 'consumed')
      AND platform_offer_id IN ${sqlClient(ids)}
      AND store_id IS NOT DISTINCT FROM ${storePk}
  `;
  return new Set(used.map((u) => Number(u.platform_offer_id)).filter((n) => Number.isFinite(n) && n > 0));
}
