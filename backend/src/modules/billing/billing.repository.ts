import { and, asc, eq, gte, inArray, isNull, lte, or, sql } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { getEnv } from "../../config/env.js";
import { getSql } from "../../db/client.js";
import {
  billingRulesetVersion,
  billingPricingRules,
  billingPricingRuleConditions,
  billingDeliverySlabs,
  billingPackagingSlabs,
  billingDeliveryRateCards,
  billingPlatformOffers,
  billingDiscounts,
  merchantBillingOverrides,
  merchantOffers as merchantOffersTable,
  merchantOfferUsages,
} from "../../db/schema.js";
import type {
  BillingDataset,
  ConditionRow,
  DeliveryRateCardRow,
  DiscountRow,
  MerchantOfferRow,
  PackagingSlabRow,
  PlatformOfferRow,
  RuleRow,
  SlabRow,
  TaxConfigRow,
} from "./types.js";
import {
  narrowBillingRulesForService,
  narrowTaxConfigsForService,
} from "./billingRuleSelection.js";

function n(v: unknown): number | null {
  if (v == null) return null;
  const x = typeof v === "number" ? v : parseFloat(String(v));
  return Number.isFinite(x) ? x : null;
}

function nn(v: unknown): number {
  return n(v) ?? 0;
}

function hasApplicableBaseTax(taxConfigs: TaxConfigRow[], base: string): boolean {
  const b = base.trim().toUpperCase();
  return taxConfigs.some((t) => String(t.applicableBase ?? "").trim().toUpperCase() === b && (t.rate ?? 0) > 0);
}

function sumItemGstRate(taxConfigs: TaxConfigRow[]): number {
  // Heuristic: sum the rates of configs that target item taxable value.
  // This matches common India GST modeling (single GST slab), but also works when CGST+SGST are modeled separately.
  const bases = new Set(["ITEM_AFTER_DISCOUNT", "ITEM_SUBTOTAL"]);
  return taxConfigs
    .filter((t) => bases.has(String(t.applicableBase ?? "").trim().toUpperCase()))
    .reduce((s, t) => s + (Number(t.rate) || 0), 0);
}

function safeEnvForTaxInjection(): {
  APPLY_GST_ON_DELIVERY_FEE: boolean;
  DELIVERY_FEE_GST_PERCENT?: number;
  APPLY_GST_ON_PACKAGING: boolean;
  PACKAGING_GST_MODE?: "same_as_item";
} {
  try {
    const env = getEnv();
    return {
      APPLY_GST_ON_DELIVERY_FEE: env.APPLY_GST_ON_DELIVERY_FEE === true,
      DELIVERY_FEE_GST_PERCENT: env.DELIVERY_FEE_GST_PERCENT,
      APPLY_GST_ON_PACKAGING: env.APPLY_GST_ON_PACKAGING === true,
      PACKAGING_GST_MODE: env.PACKAGING_GST_MODE,
    };
  } catch {
    // In tests / scripts without env loaded, skip injection quietly.
    return {
      APPLY_GST_ON_DELIVERY_FEE: false,
      APPLY_GST_ON_PACKAGING: false,
    };
  }
}

export async function getRulesetVersion(db: PostgresJsDatabase<Record<string, unknown>>): Promise<number> {
  const rows = await db
    .select({ version: billingRulesetVersion.version })
    .from(billingRulesetVersion)
    .where(eq(billingRulesetVersion.id, 1))
    .limit(1);
  return rows[0]?.version ?? 1;
}

/** Active promo codes customers can type at checkout (dashboard `billing_discounts`). */
export async function listActiveCustomerCoupons(
  db: PostgresJsDatabase<Record<string, unknown>>,
  serviceTypeUpper: string
): Promise<
  Array<{
    code: string;
    discountType: string;
    valueNumeric: number | null;
    maxDiscountCap: number | null;
  }>
> {
  const st = serviceTypeUpper.trim().toUpperCase();
  const now = new Date();
  const rows = await db
    .select({
      code: billingDiscounts.code,
      discountType: billingDiscounts.discountType,
      valueNumeric: billingDiscounts.valueNumeric,
      maxDiscountCap: billingDiscounts.maxDiscountCap,
    })
    .from(billingDiscounts)
    .where(
      and(
        eq(billingDiscounts.isActive, true),
        eq(billingDiscounts.isHidden, false),
        eq(billingDiscounts.offerAudience, "CUSTOMER"),
        or(eq(billingDiscounts.serviceType, st), eq(billingDiscounts.serviceType, "ALL")),
        or(isNull(billingDiscounts.validFrom), lte(billingDiscounts.validFrom, now)),
        or(isNull(billingDiscounts.validUntil), gte(billingDiscounts.validUntil, now)),
        or(
          isNull(billingDiscounts.usageLimit),
          sql`${billingDiscounts.usedCount} < ${billingDiscounts.usageLimit}`
        )
      )
    )
    .orderBy(asc(billingDiscounts.code))
    .limit(80);

  return rows.map((r) => ({
    code: r.code,
    discountType: String(r.discountType),
    valueNumeric: n(r.valueNumeric),
    maxDiscountCap: n(r.maxDiscountCap),
  }));
}

export async function bumpRulesetVersion(db: PostgresJsDatabase<Record<string, unknown>>): Promise<number> {
  await db
    .update(billingRulesetVersion)
    .set({ version: sql`${billingRulesetVersion.version} + 1`, updatedAt: new Date() })
    .where(eq(billingRulesetVersion.id, 1));
  return getRulesetVersion(db);
}

export async function loadBillingDatasetUncached(
  db: PostgresJsDatabase<Record<string, unknown>>,
  opts: { merchantStoreId: number; couponCode: string | null; serviceType?: string }
): Promise<BillingDataset> {
  const serviceType = (opts.serviceType ?? "FOOD").trim().toUpperCase();
  const rulesetVersion = await getRulesetVersion(db);

  const ruleRows = await db
    .select()
    .from(billingPricingRules)
    .where(eq(billingPricingRules.isActive, true))
    .orderBy(asc(billingPricingRules.chargeOrderKey), asc(billingPricingRules.id));

  /** TAX rows are slabs linked to billing_tax_configs; applied in tax phase, not as generic rules. */
  const engineRuleRows = ruleRows.filter((r) => r.type !== "TAX");

  const ruleIds = engineRuleRows.map((r) => r.id);
  const condRows =
    ruleIds.length === 0
      ? []
      : await db
          .select()
          .from(billingPricingRuleConditions)
          .where(inArray(billingPricingRuleConditions.ruleId, ruleIds));

  const byRule = new Map<number, ConditionRow[]>();
  for (const c of condRows) {
    const list = byRule.get(c.ruleId) ?? [];
    list.push({
      conditionType: c.conditionType,
      operator: c.operator,
      valueMin: n(c.valueMin),
      valueMax: n(c.valueMax),
      valueText: c.valueText,
      valueJson: c.valueJson,
    });
    byRule.set(c.ruleId, list);
  }

  const rules: RuleRow[] = narrowBillingRulesForService(
    engineRuleRows.map((r) => ({
      id: r.id,
      name: r.name,
      type: r.type,
      calculationType: r.calculationType,
      valueNumeric: n(r.valueNumeric),
      valueJson: r.valueJson,
      priority: r.priority,
      chargeOrderKey: (r as { chargeOrderKey?: number }).chargeOrderKey ?? r.priority,
      stackable: r.stackable,
      appliesTo: r.appliesTo,
      offerOwner: r.offerOwner,
      isHidden: r.isHidden,
      metadata: (r.metadata as Record<string, unknown> | null) ?? null,
      conditions: byRule.get(r.id) ?? [],
      serviceType: (r.serviceType ?? "FOOD").trim().toUpperCase(),
      discountAppliesOn: String((r as { discountAppliesOn?: string }).discountAppliesOn ?? "ITEMS_TOTAL").toUpperCase(),
      chargeSubtype: (r as { chargeSubtype?: string | null }).chargeSubtype ?? null,
    })),
    serviceType
  );

  const slabDb = await db
    .select()
    .from(billingDeliverySlabs)
    .where(eq(billingDeliverySlabs.isActive, true))
    .orderBy(asc(billingDeliverySlabs.priority));

  const deliverySlabs: SlabRow[] = slabDb.map((s) => ({
    id: s.id,
    name: s.name,
    minKm: n(s.minKm),
    maxKm: n(s.maxKm),
    feeFixed: n(s.feeFixed) ?? 0,
    feePerKm: n(s.feePerKm) ?? 0,
    scopeType: s.scopeType,
    scopeId: s.scopeId != null ? Number(s.scopeId) : null,
    priority: s.priority,
  }));

  const packDb = await db
    .select()
    .from(billingPackagingSlabs)
    .where(eq(billingPackagingSlabs.isActive, true))
    .orderBy(asc(billingPackagingSlabs.priority));

  const packagingSlabs: PackagingSlabRow[] = packDb.map((s) => ({
    id: s.id,
    name: s.name,
    minCart: n(s.minCart),
    maxCart: n(s.maxCart),
    feeFixed: n(s.feeFixed) ?? 0,
    feePerAddonQty: n(s.feePerAddonQty) ?? 0,
    scopeType: s.scopeType,
    scopeId: s.scopeId != null ? Number(s.scopeId) : null,
    priority: s.priority,
  }));

  const rateDb = await db
    .select()
    .from(billingDeliveryRateCards)
    .where(eq(billingDeliveryRateCards.isActive, true))
    .orderBy(asc(billingDeliveryRateCards.priority));

  const deliveryRateCards: DeliveryRateCardRow[] = rateDb
    .map(
      (c): DeliveryRateCardRow => ({
        id: c.id,
        name: c.name,
        serviceType: (c.serviceType ?? "FOOD").trim().toUpperCase(),
        cityName: c.cityName,
        timeSlot: c.timeSlot,
        baseFare: nn(c.baseFare),
        perKmRate: nn(c.perKmRate),
        surgeMultiplier: nn(c.surgeMultiplier) || 1,
        minKm: n(c.minKm),
        maxKm: n(c.maxKm),
        freeDeliveryAbove: n(c.freeDeliveryAbove),
        priority: c.priority,
      })
    )
    .filter((c) => c.serviceType === serviceType || c.serviceType === "ALL");

  const offerDb = await db
    .select()
    .from(billingPlatformOffers)
    .where(eq(billingPlatformOffers.isActive, true))
    .orderBy(asc(billingPlatformOffers.priority));

  const platformOffers: PlatformOfferRow[] = offerDb
    .map(
      (o): PlatformOfferRow => ({
        id: o.id,
        name: o.name,
        serviceType: (o.serviceType ?? "FOOD").trim().toUpperCase(),
        discountType: o.discountType ?? "PERCENTAGE",
        valueNumeric: n(o.valueNumeric),
        deliveryDiscountType: o.deliveryDiscountType,
        deliveryDiscountValue: n(o.deliveryDiscountValue),
        offerKind: (o.offerKind ?? "DISCOUNT").toUpperCase(),
        offerAudience: (o.offerAudience ?? "CUSTOMER").toUpperCase(),
        fundingMode: (o.fundingMode ?? "PLATFORM_ONLY").toUpperCase(),
        platformSharePct: n(o.platformSharePct) ?? 100,
        merchantSharePct: n(o.merchantSharePct) ?? 0,
        maxPlatformContribution: n(o.maxPlatformContribution),
        maxMerchantContribution: n(o.maxMerchantContribution),
        targetScope: (o.targetScope ?? "GLOBAL").toUpperCase(),
        geoLevel: o.geoLevel,
        geoIds: Array.isArray(o.geoIds)
          ? o.geoIds.map((x) => String(x)).filter((x) => x.length > 0)
          : [],
        merchantIds: Array.isArray(o.merchantIds)
          ? o.merchantIds
              .map((x) => Number(x))
              .filter((x) => Number.isInteger(x) && x > 0)
          : [],
        customerSegment: (o.customerSegment ?? "ALL").toUpperCase(),
        minOrderAmount: n(o.minOrderAmount),
        maxDiscountAmount: n(o.maxDiscountAmount),
        buyQty: o.buyQty ?? null,
        getQty: o.getQty ?? null,
        isStackable: Boolean(o.isStackable),
        exclusionGroup: o.exclusionGroup ?? null,
        startsAt: o.startsAt ?? null,
        endsAt: o.endsAt ?? null,
        budgetTotal: n(o.budgetTotal),
        budgetUsed: n(o.budgetUsed),
        priority: o.priority,
        isHidden: o.isHidden,
        conditions: (o.conditions as Record<string, unknown>) ?? {},
      })
    )
    .filter((o) => o.serviceType === serviceType || o.serviceType === "ALL");

  const pg = getSql();
  type TaxJoin = {
    id: number;
    name: string;
    rate: string;
    applicable_base: string;
    tax_group: string | null;
    priority: number;
    charge_order_key: string;
    is_hidden: boolean;
    service_type: string;
  };
  const taxRows = await pg<TaxJoin[]>`
    SELECT
      t.id,
      t.name,
      t.rate::text AS rate,
      t.applicable_base::text AS applicable_base,
      t.tax_group::text AS tax_group,
      r.priority,
      r.charge_order_key::text AS charge_order_key,
      r.is_hidden,
      COALESCE(r.service_type, t.service_type, 'FOOD') AS service_type
    FROM billing_tax_configs t
    INNER JOIN billing_pricing_rules r
      ON r.tax_config_id = t.id AND r.type = 'TAX'::billing_rule_type
    WHERE r.is_active = true
    ORDER BY r.charge_order_key ASC, t.id ASC
  `;

  let taxConfigs: TaxConfigRow[] = narrowTaxConfigsForService(
    taxRows.map((t) => ({
      id: t.id,
      name: t.name,
      rate: n(t.rate) ?? 0,
      applicableBase: t.applicable_base,
      taxGroup: t.tax_group ?? null,
      priority: t.priority,
      chargeOrderKey: Number(t.charge_order_key) || t.priority,
      isHidden: t.is_hidden,
      serviceType: (t.service_type ?? "FOOD").trim().toUpperCase(),
    })),
    serviceType
  );

  // Optional runtime injection: add GST lines for delivery/packaging if not already configured in DB.
  // This is intentionally opt-in via env and will never duplicate existing tax configs.
  const env = safeEnvForTaxInjection();
  if (
    serviceType !== "RIDE" &&
    env.APPLY_GST_ON_DELIVERY_FEE &&
    !hasApplicableBaseTax(taxConfigs, "DELIVERY_FEE")
  ) {
    const pct = env.DELIVERY_FEE_GST_PERCENT ?? 5;
    const rate = Math.max(0, Math.min(1, pct / 100));
    if (rate > 0) {
      taxConfigs.push({
        id: -1001,
        name: `GST on delivery fee (${pct}%)`,
        rate,
        applicableBase: "DELIVERY_FEE",
        taxGroup: "delivery",
        priority: 999999,
        chargeOrderKey: 999999,
        isHidden: false,
        serviceType,
      });
    }
  }

  if (
    serviceType !== "RIDE" &&
    env.APPLY_GST_ON_PACKAGING &&
    !hasApplicableBaseTax(taxConfigs, "PACKAGING_FEE")
  ) {
    const mode = (env.PACKAGING_GST_MODE ?? "same_as_item").trim().toLowerCase();
    const derivedRate = mode === "same_as_item" ? sumItemGstRate(taxConfigs) : 0;
    const rate = Math.max(0, Math.min(1, derivedRate));
    if (rate > 0) {
      taxConfigs.push({
        id: -1002,
        name: "GST on packaging",
        rate,
        applicableBase: "PACKAGING_FEE",
        taxGroup: "packaging",
        priority: 999998,
        chargeOrderKey: 999998,
        isHidden: false,
        serviceType,
      });
    }
  }

  let merchantOffers: MerchantOfferRow[] = [];
  if (serviceType === "FOOD") {
    const now = new Date();
    try {
      const mo = await db
        .select({
          id:                  merchantOffersTable.id,
          offerId:             merchantOffersTable.offerId,
          offerTitle:          merchantOffersTable.offerTitle,
          offerType:           merchantOffersTable.offerType,
          offerSubType:        merchantOffersTable.offerSubType,
          discountValue:       merchantOffersTable.discountValue,
          discountPercentage:  merchantOffersTable.discountPercentage,
          maxDiscountAmount:   merchantOffersTable.maxDiscountAmount,
          minOrderAmount:      merchantOffersTable.minOrderAmount,
          maxOrderAmount:      merchantOffersTable.maxOrderAmount,
          buyQuantity:         merchantOffersTable.buyQuantity,
          getQuantity:         merchantOffersTable.getQuantity,
          couponCode:          merchantOffersTable.couponCode,
          autoApply:           merchantOffersTable.autoApply,
          isStackable:         merchantOffersTable.isStackable,
          perOrderLimit:       merchantOffersTable.perOrderLimit,
          firstOrderOnly:      merchantOffersTable.firstOrderOnly,
          newUserOnly:         merchantOffersTable.newUserOnly,
          maxUsesTotal:        merchantOffersTable.maxUsesTotal,
          maxUsesPerUser:      merchantOffersTable.maxUsesPerUser,
          currentUses:         merchantOffersTable.currentUses,
          applicableOnDays:    merchantOffersTable.applicableOnDays,
          applicableTimeStart: merchantOffersTable.applicableTimeStart,
          applicableTimeEnd:   merchantOffersTable.applicableTimeEnd,
          maxDiscountPerOrder: merchantOffersTable.maxDiscountPerOrder,
          offerMetadata:       merchantOffersTable.offerMetadata,
          displayPriority:     merchantOffersTable.displayPriority,
          priority:            merchantOffersTable.priority,
          createdSourcePlatform: merchantOffersTable.createdSourcePlatform,
          createdByRole:         merchantOffersTable.createdByRole,
          approvalStatus:        merchantOffersTable.approvalStatus,
        })
        .from(merchantOffersTable)
        .where(
          and(
            eq(merchantOffersTable.storeId, opts.merchantStoreId),
            eq(merchantOffersTable.isActive, true),
            or(
              eq(merchantOffersTable.lifecycleStatus, "ACTIVE"),
              eq(merchantOffersTable.lifecycleStatus, "SCHEDULED"),
              sql`${merchantOffersTable.lifecycleStatus} IS NULL`
            ),
            lte(merchantOffersTable.validFrom, now),
            gte(merchantOffersTable.validTill, now),
          )
        )
        .orderBy(sql`${merchantOffersTable.displayPriority} DESC NULLS LAST`, asc(merchantOffersTable.id));

      // Applicability holds resolved menu PKs; metadata often has catalog item_id strings.
      // Merge both (same as customer offers listing) so Boost eligibility matches cart PKs.
      const offerPks = mo.map((r) => Number(r.id)).filter((id) => Number.isFinite(id) && id > 0);
      const idsByOfferPk = new Map<number, string[]>();
      if (offerPks.length > 0) {
        try {
          const pg = getSql();
          const appRows = await pg`
            SELECT
              a.offer_id,
              a.menu_item_id,
              m.item_id
            FROM merchant_offer_applicability a
            LEFT JOIN merchant_menu_items m ON m.id = a.menu_item_id
            WHERE a.offer_id = ANY(${offerPks})
              AND a.menu_item_id IS NOT NULL
          `;
          for (const row of appRows as Array<{
            offer_id: number | string;
            menu_item_id: number | string | null;
            item_id: string | null;
          }>) {
            const oid = Number(row.offer_id);
            if (!Number.isFinite(oid)) continue;
            const list = idsByOfferPk.get(oid) ?? [];
            if (row.menu_item_id != null) list.push(String(row.menu_item_id));
            if (row.item_id) list.push(String(row.item_id).trim());
            idsByOfferPk.set(oid, list);
          }
        } catch {
          // Older DBs may lack applicability — metadata-only fallback.
        }
      }

      merchantOffers = mo.map((r) => {
        const meta =
          r.offerMetadata && typeof r.offerMetadata === "object"
            ? { ...(r.offerMetadata as Record<string, unknown>) }
            : {};
        const fromMetaRaw = meta.menu_item_ids ?? meta.menuItemIds ?? meta.selected_item_ids;
        const fromMeta = Array.isArray(fromMetaRaw)
          ? fromMetaRaw.map((v) => String(v).trim()).filter(Boolean)
          : [];
        const fromApp = idsByOfferPk.get(Number(r.id)) ?? [];
        const mergedIds = [...new Set([...fromMeta, ...fromApp])];
        if (mergedIds.length > 0) {
          meta.menu_item_ids = mergedIds;
        }
        return {
          id:                  r.id,
          offerId:             r.offerId,
          title:               r.offerTitle,
          offerType:           String(r.offerType ?? "PERCENTAGE"),
          offerSubType:        r.offerSubType ?? null,
          discountValue:       n(r.discountValue),
          discountPercentage:  n(r.discountPercentage),
          maxDiscountAmount:   n(r.maxDiscountAmount),
          minOrderAmount:      n(r.minOrderAmount),
          maxOrderAmount:      n(r.maxOrderAmount),
          buyQuantity:         r.buyQuantity ?? null,
          getQuantity:         r.getQuantity ?? null,
          couponCode:          r.couponCode ?? null,
          autoApply:           r.autoApply ?? true,
          isStackable:         r.isStackable ?? false,
          perOrderLimit:       r.perOrderLimit ?? 1,
          firstOrderOnly:      r.firstOrderOnly ?? false,
          newUserOnly:         r.newUserOnly ?? false,
          maxUsesTotal:        r.maxUsesTotal ?? null,
          maxUsesPerUser:      r.maxUsesPerUser ?? null,
          currentUses:         r.currentUses ?? 0,
          applicableOnDays:    Array.isArray(r.applicableOnDays) ? r.applicableOnDays as string[] : null,
          applicableTimeStart: r.applicableTimeStart ?? null,
          applicableTimeEnd:   r.applicableTimeEnd ?? null,
          maxDiscountPerOrder: n(r.maxDiscountPerOrder),
          metadata:            meta,
          displayPriority:     r.displayPriority ?? 0,
          priority:            r.priority ?? 0,
          createdSourcePlatform: r.createdSourcePlatform ?? "MERCHANT_APP",
          createdByRole:         r.createdByRole ?? "MERCHANT",
          approvalStatus:        r.approvalStatus ?? "AUTO_APPROVED",
        };
      });
    } catch {
      merchantOffers = [];
    }
  }

  // Load per-user usage counts for merchant offers if userId is provided (for max_uses_per_user enforcement).
  // Callers pass userId via opts; billing.service.ts injects it when computing a real order.
  let merchantOfferUsagesByUser: Map<number, number> | undefined;
  const userId = (opts as { userId?: number }).userId;
  if (userId != null && merchantOffers.length > 0) {
    const offerIds = merchantOffers.map((o) => o.id);
    const usageRows = await db
      .select({ offerId: merchantOfferUsages.offerId, cnt: sql<number>`count(*)::int` })
      .from(merchantOfferUsages)
      .where(
        and(
          eq(merchantOfferUsages.userId, userId),
          eq(merchantOfferUsages.isReversed, false),
          inArray(merchantOfferUsages.offerId, offerIds)
        )
      )
      .groupBy(merchantOfferUsages.offerId);
    merchantOfferUsagesByUser = new Map(usageRows.map((r) => [r.offerId, r.cnt]));
  }

  const [ovRow] = await db
    .select()
    .from(merchantBillingOverrides)
    .where(eq(merchantBillingOverrides.merchantStoreId, opts.merchantStoreId))
    .limit(1);

  let coupon: DiscountRow | null = null;
  const code = opts.couponCode?.trim();
  if (code) {
    const [d] = await db
      .select()
      .from(billingDiscounts)
      .where(
        and(eq(billingDiscounts.isActive, true), sql`lower(${billingDiscounts.code}) = ${code.toLowerCase()}`)
      )
      .limit(1);
    if (d) {
      const rowSt = (d.serviceType ?? "FOOD").trim().toUpperCase();
      if (rowSt === serviceType || rowSt === "ALL") {
        const audRaw = String(d.offerAudience ?? "CUSTOMER").toUpperCase();
        const offerAudience =
          audRaw === "MERCHANT" || audRaw === "RIDER" ? audRaw : "CUSTOMER";
        coupon = {
          id: d.id,
          code: d.code,
          discountType: d.discountType,
          valueNumeric: n(d.valueNumeric),
          maxDiscountCap: n(d.maxDiscountCap),
          usageLimit: d.usageLimit,
          usedCount: d.usedCount,
          validFrom: d.validFrom,
          validUntil: d.validUntil,
          isActive: d.isActive,
          isHidden: d.isHidden,
          serviceType: rowSt,
          offerAudience,
          perUserUsageLimit: d.perUserUsageLimit ?? null,
          metadata: (d.metadata as Record<string, unknown> | null) ?? null,
        };
      }
    }
  }

  return {
    rulesetVersion,
    rules,
    deliverySlabs,
    packagingSlabs,
    deliveryRateCards,
    platformOffers,
    merchantOffers,
    taxConfigs,
    merchantOverrides: (ovRow?.overrides as Record<string, unknown> | null) ?? null,
    coupon,
    merchantOfferUsagesByUser,
  };
}

/**
 * Load per-user redemption counts for a set of merchant offers.
 * Called separately from the cached dataset so the cache stays user-agnostic.
 */
export async function loadMerchantOfferUsagesByUser(
  db: PostgresJsDatabase<Record<string, unknown>>,
  userId: number,
  offerIds: number[]
): Promise<Map<number, number>> {
  if (!userId || offerIds.length === 0) return new Map();
  const rows = await db
    .select({ offerId: merchantOfferUsages.offerId, cnt: sql<number>`count(*)::int` })
    .from(merchantOfferUsages)
    .where(
      and(
        eq(merchantOfferUsages.userId, userId),
        eq(merchantOfferUsages.isReversed, false),
        inArray(merchantOfferUsages.offerId, offerIds)
      )
    )
    .groupBy(merchantOfferUsages.offerId);
  return new Map(rows.map((r) => [r.offerId, r.cnt]));
}
