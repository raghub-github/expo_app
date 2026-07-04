import { bumpBillingRulesetVersion, sqlJsonb } from "./billing-admin";
import { getSql } from "../client";

function sanitizePlatformOfferConditions(input: unknown): Record<string, unknown> {
  if (input != null && typeof input === "object" && !Array.isArray(input)) {
    const c = { ...(input as Record<string, unknown>) };
    delete c.geo_targets;
    // Segment is stored on the row (`customer_segment`); drop legacy duplicate in JSON.
    delete c.user_segment;
    // Min cart gate is `min_order_amount` on the row; drop legacy duplicate in JSON.
    delete c.min_order_value;
    return c;
  }
  return {};
}

function parseJsonArrayField(v: unknown): unknown[] {
  if (Array.isArray(v)) return v;
  if (typeof v === "string") {
    const t = v.trim();
    if (!t) return [];
    try {
      const parsed = JSON.parse(t) as unknown;
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

function normalizeTimestamptzInput(v: string | null | undefined): string | null {
  if (v == null) return null;
  const t = String(v).trim();
  if (!t) return null;
  const d = new Date(t);
  if (Number.isNaN(d.getTime())) {
    throw new Error("Invalid date/time value");
  }
  return d.toISOString();
}

function normalizePlatformOfferInput(input: InsertPlatformOfferInput): InsertPlatformOfferInput {
  const starts_at = normalizeTimestamptzInput(input.starts_at);
  const ends_at = normalizeTimestamptzInput(input.ends_at);
  if (starts_at && ends_at && new Date(starts_at) > new Date(ends_at)) {
    throw new Error("End date/time must be on or after start date/time.");
  }
  return {
    ...input,
    geo_ids: parseJsonArrayField(input.geo_ids),
    merchant_ids: parseJsonArrayField(input.merchant_ids),
    starts_at,
    ends_at,
    priority: Number(input.priority ?? 0) || 0,
    buy_qty: input.buy_qty == null ? null : Number(input.buy_qty),
    get_qty: input.get_qty == null ? null : Number(input.get_qty),
  };
}

export function formatPlatformOfferDbError(e: unknown): string {
  const err = e as { code?: string; constraint_name?: string; message?: string };
  if (err.code === "23514") {
    if (
      err.constraint_name === "billing_platform_offers_time_window_chk" ||
      /time_window/i.test(err.message ?? "")
    ) {
      return "End date/time must be on or after start date/time.";
    }
    if (err.constraint_name === "billing_platform_offers_share_pct_chk") {
      return "Platform and merchant share percentages must add up to 100.";
    }
    if (err.constraint_name === "billing_platform_offers_offer_kind_chk") {
      return "This offer kind is not allowed by the database. Run billing migrations or pick a supported kind.";
    }
    return "Offer failed a database validation rule. Check dates, shares, and field values.";
  }
  return e instanceof Error ? e.message : "Failed";
}

export type DeliveryRateCardAdminRow = {
  id: number;
  name: string | null;
  service_type: string;
  city_name: string | null;
  time_slot: string | null;
  base_fare: string;
  per_km_rate: string;
  surge_multiplier: string;
  min_km: string | null;
  max_km: string | null;
  free_delivery_above: string | null;
  priority: number;
  is_active: boolean;
  metadata: unknown;
};

export async function listDeliveryRateCards(): Promise<DeliveryRateCardAdminRow[]> {
  const sql = getSql();
  return sql<DeliveryRateCardAdminRow[]>`
    SELECT id, name, service_type, city_name, time_slot,
      base_fare::text AS base_fare, per_km_rate::text AS per_km_rate, surge_multiplier::text AS surge_multiplier,
      min_km::text AS min_km, max_km::text AS max_km,
      free_delivery_above::text AS free_delivery_above,
      priority, is_active, metadata
    FROM billing_delivery_rate_cards
    ORDER BY priority ASC, id ASC
  `;
}

export type InsertDeliveryRateCardInput = {
  name?: string | null;
  service_type?: string;
  city_name?: string | null;
  time_slot?: string | null;
  base_fare?: number;
  per_km_rate?: number;
  surge_multiplier?: number;
  min_km?: number | null;
  max_km?: number | null;
  free_delivery_above?: number | null;
  priority?: number;
  is_active?: boolean;
  metadata?: unknown;
};

export async function insertDeliveryRateCard(input: InsertDeliveryRateCardInput): Promise<DeliveryRateCardAdminRow> {
  const sql = getSql();
  const st = (input.service_type ?? "FOOD").trim().toUpperCase();
  const rows = await sql`
    INSERT INTO billing_delivery_rate_cards (
      name, service_type, city_name, time_slot,
      base_fare, per_km_rate, surge_multiplier,
      min_km, max_km, free_delivery_above, priority, is_active, metadata
    ) VALUES (
      ${input.name ?? null},
      ${st},
      ${input.city_name ?? null},
      ${input.time_slot ?? null},
      ${input.base_fare ?? 0},
      ${input.per_km_rate ?? 0},
      ${input.surge_multiplier ?? 1},
      ${input.min_km ?? null},
      ${input.max_km ?? null},
      ${input.free_delivery_above ?? null},
      ${input.priority ?? 0},
      ${input.is_active ?? true},
      ${sqlJsonb(input.metadata)}::jsonb
    )
    RETURNING id, name, service_type, city_name, time_slot,
      base_fare::text AS base_fare, per_km_rate::text AS per_km_rate, surge_multiplier::text AS surge_multiplier,
      min_km::text AS min_km, max_km::text AS max_km,
      free_delivery_above::text AS free_delivery_above,
      priority, is_active, metadata
  `;
  const row = rows[0] as DeliveryRateCardAdminRow | undefined;
  if (!row) throw new Error("insertDeliveryRateCard failed");
  await bumpBillingRulesetVersion();
  return row;
}

export async function updateDeliveryRateCard(
  id: number,
  input: InsertDeliveryRateCardInput
): Promise<DeliveryRateCardAdminRow | null> {
  const sql = getSql();
  const st = (input.service_type ?? "FOOD").trim().toUpperCase();
  const rows = await sql`
    UPDATE billing_delivery_rate_cards SET
      name = ${input.name ?? null},
      service_type = ${st},
      city_name = ${input.city_name ?? null},
      time_slot = ${input.time_slot ?? null},
      base_fare = ${input.base_fare ?? 0},
      per_km_rate = ${input.per_km_rate ?? 0},
      surge_multiplier = ${input.surge_multiplier ?? 1},
      min_km = ${input.min_km ?? null},
      max_km = ${input.max_km ?? null},
      free_delivery_above = ${input.free_delivery_above ?? null},
      priority = ${input.priority ?? 0},
      is_active = ${input.is_active ?? true},
      metadata = ${sqlJsonb(input.metadata)}::jsonb,
      updated_at = now()
    WHERE id = ${id}
    RETURNING id, name, service_type, city_name, time_slot,
      base_fare::text AS base_fare, per_km_rate::text AS per_km_rate, surge_multiplier::text AS surge_multiplier,
      min_km::text AS min_km, max_km::text AS max_km,
      free_delivery_above::text AS free_delivery_above,
      priority, is_active, metadata
  `;
  const row = rows[0] as DeliveryRateCardAdminRow | undefined;
  if (!row) return null;
  await bumpBillingRulesetVersion();
  return row;
}

export async function deleteDeliveryRateCard(id: number): Promise<boolean> {
  const sql = getSql();
  const r = await sql`DELETE FROM billing_delivery_rate_cards WHERE id = ${id}`;
  const ok = (r as { count: number }).count > 0;
  if (ok) await bumpBillingRulesetVersion();
  return ok;
}

export type PlatformOfferAdminRow = {
  id: number;
  name: string | null;
  service_type: string;
  offer_kind: string;
  offer_audience: string;
  funding_mode: string;
  platform_share_pct: string;
  merchant_share_pct: string;
  max_platform_contribution: string | null;
  max_merchant_contribution: string | null;
  target_scope: string;
  geo_level: string | null;
  geo_ids: unknown;
  merchant_ids: unknown;
  customer_segment: string;
  min_order_amount: string | null;
  max_discount_amount: string | null;
  buy_qty: number | null;
  get_qty: number | null;
  is_stackable: boolean;
  exclusion_group: string | null;
  starts_at: string | null;
  ends_at: string | null;
  budget_total: string | null;
  budget_used: string | null;
  discount_type: string;
  value_numeric: string | null;
  delivery_discount_type: string | null;
  delivery_discount_value: string | null;
  priority: number;
  is_active: boolean;
  is_hidden: boolean;
  conditions: unknown;
  metadata: unknown;
};

export async function listPlatformOffers(): Promise<PlatformOfferAdminRow[]> {
  const sql = getSql();
  return sql<PlatformOfferAdminRow[]>`
    SELECT id::int AS id, name, service_type,
      offer_kind, offer_audience, funding_mode,
      platform_share_pct::text AS platform_share_pct,
      merchant_share_pct::text AS merchant_share_pct,
      max_platform_contribution::text AS max_platform_contribution,
      max_merchant_contribution::text AS max_merchant_contribution,
      target_scope, geo_level, geo_ids, merchant_ids, customer_segment,
      min_order_amount::text AS min_order_amount,
      max_discount_amount::text AS max_discount_amount,
      buy_qty, get_qty, is_stackable, exclusion_group,
      starts_at::text AS starts_at, ends_at::text AS ends_at,
      budget_total::text AS budget_total, budget_used::text AS budget_used,
      discount_type,
      value_numeric::text AS value_numeric,
      delivery_discount_type,
      delivery_discount_value::text AS delivery_discount_value,
      priority, is_active, is_hidden, conditions, metadata
    FROM billing_platform_offers
    ORDER BY priority ASC, id ASC
  `;
}

export async function getPlatformOfferById(id: number): Promise<PlatformOfferAdminRow | null> {
  const sql = getSql();
  const [row] = await sql<PlatformOfferAdminRow[]>`
    SELECT id::int AS id, name, service_type,
      offer_kind, offer_audience, funding_mode,
      platform_share_pct::text AS platform_share_pct,
      merchant_share_pct::text AS merchant_share_pct,
      max_platform_contribution::text AS max_platform_contribution,
      max_merchant_contribution::text AS max_merchant_contribution,
      target_scope, geo_level, geo_ids, merchant_ids, customer_segment,
      min_order_amount::text AS min_order_amount,
      max_discount_amount::text AS max_discount_amount,
      buy_qty, get_qty, is_stackable, exclusion_group,
      starts_at::text AS starts_at, ends_at::text AS ends_at,
      budget_total::text AS budget_total, budget_used::text AS budget_used,
      discount_type,
      value_numeric::text AS value_numeric,
      delivery_discount_type,
      delivery_discount_value::text AS delivery_discount_value,
      priority, is_active, is_hidden, conditions, metadata
    FROM billing_platform_offers
    WHERE id = ${id}
    LIMIT 1
  `;
  return row ?? null;
}

export type InsertPlatformOfferInput = {
  name?: string | null;
  service_type?: string;
  offer_kind?: string;
  offer_audience?: string;
  funding_mode?: string;
  platform_share_pct?: number;
  merchant_share_pct?: number;
  max_platform_contribution?: number | null;
  max_merchant_contribution?: number | null;
  target_scope?: string;
  geo_level?: string | null;
  geo_ids?: unknown;
  merchant_ids?: unknown;
  customer_segment?: string;
  min_order_amount?: number | null;
  max_discount_amount?: number | null;
  buy_qty?: number | null;
  get_qty?: number | null;
  is_stackable?: boolean;
  exclusion_group?: string | null;
  starts_at?: string | null;
  ends_at?: string | null;
  budget_total?: number | null;
  budget_used?: number | null;
  discount_type?: string;
  value_numeric?: number | null;
  delivery_discount_type?: string | null;
  delivery_discount_value?: number | null;
  priority?: number;
  is_active?: boolean;
  is_hidden?: boolean;
  conditions?: unknown;
  metadata?: unknown;
};

export async function insertPlatformOffer(input: InsertPlatformOfferInput): Promise<PlatformOfferAdminRow> {
  const sql = getSql();
  const normalized = normalizePlatformOfferInput(input);
  const st = (normalized.service_type ?? "FOOD").trim().toUpperCase();
  const [row] = await sql<PlatformOfferAdminRow[]>`
    INSERT INTO billing_platform_offers (
      name, service_type,
      offer_kind, offer_audience, funding_mode, platform_share_pct, merchant_share_pct,
      max_platform_contribution, max_merchant_contribution,
      target_scope, geo_level, geo_ids, merchant_ids, customer_segment,
      min_order_amount, max_discount_amount, buy_qty, get_qty, is_stackable, exclusion_group,
      starts_at, ends_at, budget_total, budget_used,
      discount_type, value_numeric,
      delivery_discount_type, delivery_discount_value,
      priority, is_active, is_hidden, conditions, metadata
    ) VALUES (
      ${normalized.name ?? null},
      ${st},
      ${(normalized.offer_kind ?? "DISCOUNT").toUpperCase()},
      ${(normalized.offer_audience ?? "CUSTOMER").toUpperCase()},
      ${(normalized.funding_mode ?? "PLATFORM_ONLY").toUpperCase()},
      ${normalized.platform_share_pct ?? 100},
      ${normalized.merchant_share_pct ?? 0},
      ${normalized.max_platform_contribution ?? null},
      ${normalized.max_merchant_contribution ?? null},
      ${(normalized.target_scope ?? "GLOBAL").toUpperCase()},
      ${normalized.geo_level ?? null},
      ${sqlJsonb(parseJsonArrayField(normalized.geo_ids))}::jsonb,
      ${sqlJsonb(parseJsonArrayField(normalized.merchant_ids))}::jsonb,
      ${(normalized.customer_segment ?? "ALL").toUpperCase()},
      ${normalized.min_order_amount ?? null},
      ${normalized.max_discount_amount ?? null},
      ${normalized.buy_qty ?? null},
      ${normalized.get_qty ?? null},
      ${normalized.is_stackable ?? false},
      ${normalized.exclusion_group ?? null},
      ${normalized.starts_at ?? null},
      ${normalized.ends_at ?? null},
      ${normalized.budget_total ?? null},
      ${normalized.budget_used ?? 0},
      ${normalized.discount_type ?? "PERCENTAGE"},
      ${normalized.value_numeric ?? null},
      ${normalized.delivery_discount_type ?? null},
      ${normalized.delivery_discount_value ?? null},
      ${normalized.priority ?? 0},
      ${normalized.is_active ?? true},
      ${normalized.is_hidden ?? false},
      ${sqlJsonb(sanitizePlatformOfferConditions(normalized.conditions))}::jsonb,
      ${sqlJsonb(normalized.metadata ?? null)}::jsonb
    )
    RETURNING id::int AS id, name, service_type,
      offer_kind, offer_audience, funding_mode,
      platform_share_pct::text AS platform_share_pct,
      merchant_share_pct::text AS merchant_share_pct,
      max_platform_contribution::text AS max_platform_contribution,
      max_merchant_contribution::text AS max_merchant_contribution,
      target_scope, geo_level, geo_ids, merchant_ids, customer_segment,
      min_order_amount::text AS min_order_amount,
      max_discount_amount::text AS max_discount_amount,
      buy_qty, get_qty, is_stackable, exclusion_group,
      starts_at::text AS starts_at, ends_at::text AS ends_at,
      budget_total::text AS budget_total, budget_used::text AS budget_used,
      discount_type,
      value_numeric::text AS value_numeric,
      delivery_discount_type,
      delivery_discount_value::text AS delivery_discount_value,
      priority, is_active, is_hidden, conditions, metadata
  `;
  if (!row) throw new Error("insertPlatformOffer failed");
  await bumpBillingRulesetVersion();
  return row;
}

export async function updatePlatformOffer(
  id: number,
  input: InsertPlatformOfferInput
): Promise<PlatformOfferAdminRow | null> {
  const sql = getSql();
  const normalized = normalizePlatformOfferInput(input);
  const st = (normalized.service_type ?? "FOOD").trim().toUpperCase();
  const [row] = await sql<PlatformOfferAdminRow[]>`
    UPDATE billing_platform_offers SET
      name = ${normalized.name ?? null},
      service_type = ${st},
      offer_kind = ${(normalized.offer_kind ?? "DISCOUNT").toUpperCase()},
      offer_audience = ${(normalized.offer_audience ?? "CUSTOMER").toUpperCase()},
      funding_mode = ${(normalized.funding_mode ?? "PLATFORM_ONLY").toUpperCase()},
      platform_share_pct = ${normalized.platform_share_pct ?? 100},
      merchant_share_pct = ${normalized.merchant_share_pct ?? 0},
      max_platform_contribution = ${normalized.max_platform_contribution ?? null},
      max_merchant_contribution = ${normalized.max_merchant_contribution ?? null},
      target_scope = ${(normalized.target_scope ?? "GLOBAL").toUpperCase()},
      geo_level = ${normalized.geo_level ?? null},
      geo_ids = ${sqlJsonb(parseJsonArrayField(normalized.geo_ids))}::jsonb,
      merchant_ids = ${sqlJsonb(parseJsonArrayField(normalized.merchant_ids))}::jsonb,
      customer_segment = ${(normalized.customer_segment ?? "ALL").toUpperCase()},
      min_order_amount = ${normalized.min_order_amount ?? null},
      max_discount_amount = ${normalized.max_discount_amount ?? null},
      buy_qty = ${normalized.buy_qty ?? null},
      get_qty = ${normalized.get_qty ?? null},
      is_stackable = ${normalized.is_stackable ?? false},
      exclusion_group = ${normalized.exclusion_group ?? null},
      starts_at = ${normalized.starts_at ?? null},
      ends_at = ${normalized.ends_at ?? null},
      budget_total = ${normalized.budget_total ?? null},
      budget_used = ${normalized.budget_used ?? 0},
      discount_type = ${normalized.discount_type ?? "PERCENTAGE"},
      value_numeric = ${normalized.value_numeric ?? null},
      delivery_discount_type = ${normalized.delivery_discount_type ?? null},
      delivery_discount_value = ${normalized.delivery_discount_value ?? null},
      priority = ${normalized.priority ?? 0},
      is_active = ${normalized.is_active ?? true},
      is_hidden = ${normalized.is_hidden ?? false},
      conditions = ${sqlJsonb(sanitizePlatformOfferConditions(normalized.conditions))}::jsonb,
      metadata = ${sqlJsonb(normalized.metadata ?? null)}::jsonb,
      updated_at = now()
    WHERE id = ${id}
    RETURNING id::int AS id, name, service_type,
      offer_kind, offer_audience, funding_mode,
      platform_share_pct::text AS platform_share_pct,
      merchant_share_pct::text AS merchant_share_pct,
      max_platform_contribution::text AS max_platform_contribution,
      max_merchant_contribution::text AS max_merchant_contribution,
      target_scope, geo_level, geo_ids, merchant_ids, customer_segment,
      min_order_amount::text AS min_order_amount,
      max_discount_amount::text AS max_discount_amount,
      buy_qty, get_qty, is_stackable, exclusion_group,
      starts_at::text AS starts_at, ends_at::text AS ends_at,
      budget_total::text AS budget_total, budget_used::text AS budget_used,
      discount_type,
      value_numeric::text AS value_numeric,
      delivery_discount_type,
      delivery_discount_value::text AS delivery_discount_value,
      priority, is_active, is_hidden, conditions, metadata
  `;
  if (!row) return null;
  await bumpBillingRulesetVersion();
  return row;
}

export async function deletePlatformOffer(id: number): Promise<boolean> {
  const sql = getSql();
  const r = await sql`DELETE FROM billing_platform_offers WHERE id = ${id}`;
  const ok = (r as { count: number }).count > 0;
  if (ok) await bumpBillingRulesetVersion();
  return ok;
}