import { and, asc, eq, inArray, sql } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
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

function n(v: unknown): number | null {
  if (v == null) return null;
  const x = typeof v === "number" ? v : parseFloat(String(v));
  return Number.isFinite(x) ? x : null;
}

function nn(v: unknown): number {
  return n(v) ?? 0;
}

export async function getRulesetVersion(db: PostgresJsDatabase<Record<string, unknown>>): Promise<number> {
  const rows = await db
    .select({ version: billingRulesetVersion.version })
    .from(billingRulesetVersion)
    .where(eq(billingRulesetVersion.id, 1))
    .limit(1);
  return rows[0]?.version ?? 1;
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

  const rules: RuleRow[] = engineRuleRows
    .map((r) => ({
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
    }))
    .filter((r) => r.serviceType === serviceType || r.serviceType === "ALL");

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

  const taxConfigs: TaxConfigRow[] = taxRows
    .map((t) => ({
      id: t.id,
      name: t.name,
      rate: n(t.rate) ?? 0,
      applicableBase: t.applicable_base,
      taxGroup: t.tax_group ?? null,
      priority: t.priority,
      chargeOrderKey: Number(t.charge_order_key) || t.priority,
      isHidden: t.is_hidden,
      serviceType: (t.service_type ?? "FOOD").trim().toUpperCase(),
    }))
    .filter((t) => t.serviceType === serviceType || t.serviceType === "ALL");

  let merchantOffers: MerchantOfferRow[] = [];
  if (serviceType === "FOOD") {
    type MoRow = {
      id: number;
      offer_title: string;
      offer_type: string | null;
      discount_value: string | null;
      discount_percentage: string | null;
      max_discount_amount: string | null;
      min_order_amount: string | null;
      offer_metadata: unknown;
      display_priority: number | null;
    };
    try {
      const mo = await pg<MoRow[]>`
        SELECT
          id,
          offer_title,
          offer_type,
          discount_value::text AS discount_value,
          discount_percentage::text AS discount_percentage,
          max_discount_amount::text AS max_discount_amount,
          min_order_amount::text AS min_order_amount,
          offer_metadata,
          display_priority
        FROM merchant_offers
        WHERE store_id = ${opts.merchantStoreId}
          AND is_active = true
          AND valid_from <= now()
          AND valid_till >= now()
        ORDER BY display_priority DESC NULLS LAST, id ASC
      `;
      merchantOffers = mo.map((r) => ({
        id: r.id,
        title: r.offer_title,
        offerType: String(r.offer_type ?? "PERCENTAGE"),
        discountValue: r.discount_value != null ? n(r.discount_value) : null,
        discountPercentage: r.discount_percentage != null ? n(r.discount_percentage) : null,
        maxDiscountAmount: r.max_discount_amount != null ? n(r.max_discount_amount) : null,
        minOrderAmount: r.min_order_amount != null ? n(r.min_order_amount) : null,
        metadata: (r.offer_metadata as Record<string, unknown>) ?? {},
        displayPriority: r.display_priority ?? 0,
      }));
    } catch {
      merchantOffers = [];
    }
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
  };
}
