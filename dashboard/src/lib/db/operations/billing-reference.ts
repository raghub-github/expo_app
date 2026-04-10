import { getSql } from "../client";
import {
  allocateUniqueBillingRulePriority,
  bumpBillingRulesetVersion,
  nextChargeOrderKey,
  sqlJsonb,
} from "./billing-admin";

/** Slabs, tax configs, coupons, and merchant overrides: bump ruleset_version so backend cache refreshes. */

export type DeliverySlabRow = {
  id: number;
  name: string | null;
  min_km: string | null;
  max_km: string | null;
  fee_fixed: string;
  fee_per_km: string;
  scope_type: string;
  scope_id: string | null;
  metadata: unknown;
  priority: number;
  is_active: boolean;
};

export async function listDeliverySlabs(): Promise<DeliverySlabRow[]> {
  const sql = getSql();
  return sql<DeliverySlabRow[]>`
    SELECT
      id,
      name,
      min_km::text AS min_km,
      max_km::text AS max_km,
      fee_fixed::text AS fee_fixed,
      fee_per_km::text AS fee_per_km,
      scope_type,
      scope_id::text AS scope_id,
      metadata,
      priority,
      is_active
    FROM billing_delivery_slabs
    ORDER BY priority ASC, id ASC
  `;
}

export async function insertDeliverySlab(input: {
  name?: string | null;
  min_km?: number | null;
  max_km?: number | null;
  fee_fixed?: number;
  fee_per_km?: number;
  scope_type?: string;
  scope_id?: number | null;
  metadata?: unknown;
  priority?: number;
  is_active?: boolean;
}): Promise<DeliverySlabRow> {
  const db = getSql();
  const [row] = await db<DeliverySlabRow[]>`
    INSERT INTO billing_delivery_slabs (
      name, min_km, max_km, fee_fixed, fee_per_km, scope_type, scope_id, metadata, priority, is_active
    ) VALUES (
      ${input.name ?? null},
      ${input.min_km ?? null},
      ${input.max_km ?? null},
      ${input.fee_fixed ?? 0},
      ${input.fee_per_km ?? 0},
      ${input.scope_type ?? "global"},
      ${input.scope_id ?? null},
      ${sqlJsonb(input.metadata)}::jsonb,
      ${input.priority ?? 0},
      ${input.is_active ?? true}
    )
    RETURNING
      id, name,
      min_km::text AS min_km,
      max_km::text AS max_km,
      fee_fixed::text AS fee_fixed,
      fee_per_km::text AS fee_per_km,
      scope_type,
      scope_id::text AS scope_id,
      metadata,
      priority,
      is_active
  `;
  if (!row) throw new Error("insertDeliverySlab failed");
  await bumpBillingRulesetVersion();
  return row;
}

export async function deleteDeliverySlab(id: number): Promise<boolean> {
  const sql = getSql();
  const r = await sql`DELETE FROM billing_delivery_slabs WHERE id = ${id}`;
  const ok = (r as unknown as { count: number }).count > 0;
  if (ok) await bumpBillingRulesetVersion();
  return ok;
}

export async function getDeliverySlab(id: number): Promise<DeliverySlabRow | null> {
  const sql = getSql();
  const [row] = await sql<DeliverySlabRow[]>`
    SELECT
      id,
      name,
      min_km::text AS min_km,
      max_km::text AS max_km,
      fee_fixed::text AS fee_fixed,
      fee_per_km::text AS fee_per_km,
      scope_type,
      scope_id::text AS scope_id,
      metadata,
      priority,
      is_active
    FROM billing_delivery_slabs
    WHERE id = ${id}
    LIMIT 1
  `;
  return row ?? null;
}

export type PatchDeliverySlabInput = Partial<{
  name: string | null;
  min_km: number | null;
  max_km: number | null;
  fee_fixed: number;
  fee_per_km: number;
  scope_type: string;
  scope_id: number | null;
  metadata: unknown;
  priority: number;
  is_active: boolean;
}>;

export async function updateDeliverySlab(id: number, patch: PatchDeliverySlabInput): Promise<DeliverySlabRow | null> {
  const cur = await getDeliverySlab(id);
  if (!cur) return null;
  const db = getSql();
  const name = patch.name !== undefined ? patch.name : cur.name;
  const minKm = patch.min_km !== undefined ? patch.min_km : cur.min_km != null ? parseFloat(cur.min_km) : null;
  const maxKm = patch.max_km !== undefined ? patch.max_km : cur.max_km != null ? parseFloat(cur.max_km) : null;
  const feeFixed =
    patch.fee_fixed !== undefined ? patch.fee_fixed : cur.fee_fixed != null ? parseFloat(cur.fee_fixed) : 0;
  const feePerKm =
    patch.fee_per_km !== undefined ? patch.fee_per_km : cur.fee_per_km != null ? parseFloat(cur.fee_per_km) : 0;
  const scopeType = patch.scope_type !== undefined ? patch.scope_type : cur.scope_type;
  const scopeId =
    patch.scope_id !== undefined
      ? patch.scope_id
      : cur.scope_id != null && cur.scope_id !== ""
        ? parseInt(cur.scope_id, 10)
        : null;
  const metadata = patch.metadata !== undefined ? patch.metadata : cur.metadata;
  const priority = patch.priority !== undefined ? patch.priority : cur.priority;
  const isActive = patch.is_active !== undefined ? patch.is_active : cur.is_active;

  const [row] = await db<DeliverySlabRow[]>`
    UPDATE billing_delivery_slabs SET
      name = ${name},
      min_km = ${minKm},
      max_km = ${maxKm},
      fee_fixed = ${feeFixed},
      fee_per_km = ${feePerKm},
      scope_type = ${scopeType},
      scope_id = ${scopeId},
      metadata = ${sqlJsonb(metadata)}::jsonb,
      priority = ${priority},
      is_active = ${isActive},
      updated_at = now()
    WHERE id = ${id}
    RETURNING
      id, name,
      min_km::text AS min_km,
      max_km::text AS max_km,
      fee_fixed::text AS fee_fixed,
      fee_per_km::text AS fee_per_km,
      scope_type,
      scope_id::text AS scope_id,
      metadata,
      priority,
      is_active
  `;
  if (!row) return null;
  await bumpBillingRulesetVersion();
  return row;
}

// ---------- Packaging / add-on slabs (cart subtotal bands) ----------

export type PackagingSlabRow = {
  id: number;
  name: string | null;
  min_cart: string | null;
  max_cart: string | null;
  fee_fixed: string;
  fee_per_addon_qty: string;
  scope_type: string;
  scope_id: string | null;
  metadata: unknown;
  priority: number;
  is_active: boolean;
};

export async function listPackagingSlabs(): Promise<PackagingSlabRow[]> {
  const sql = getSql();
  return sql<PackagingSlabRow[]>`
    SELECT
      id,
      name,
      min_cart::text AS min_cart,
      max_cart::text AS max_cart,
      fee_fixed::text AS fee_fixed,
      fee_per_addon_qty::text AS fee_per_addon_qty,
      scope_type,
      scope_id::text AS scope_id,
      metadata,
      priority,
      is_active
    FROM billing_packaging_slabs
    ORDER BY priority ASC, id ASC
  `;
}

export async function insertPackagingSlab(input: {
  name?: string | null;
  min_cart?: number | null;
  max_cart?: number | null;
  fee_fixed?: number;
  fee_per_addon_qty?: number;
  scope_type?: string;
  scope_id?: number | null;
  metadata?: unknown;
  priority?: number;
  is_active?: boolean;
}): Promise<PackagingSlabRow> {
  const db = getSql();
  const [row] = await db<PackagingSlabRow[]>`
    INSERT INTO billing_packaging_slabs (
      name, min_cart, max_cart, fee_fixed, fee_per_addon_qty, scope_type, scope_id, metadata, priority, is_active
    ) VALUES (
      ${input.name ?? null},
      ${input.min_cart ?? null},
      ${input.max_cart ?? null},
      ${input.fee_fixed ?? 0},
      ${input.fee_per_addon_qty ?? 0},
      ${input.scope_type ?? "global"},
      ${input.scope_id ?? null},
      ${sqlJsonb(input.metadata)}::jsonb,
      ${input.priority ?? 0},
      ${input.is_active ?? true}
    )
    RETURNING
      id, name,
      min_cart::text AS min_cart,
      max_cart::text AS max_cart,
      fee_fixed::text AS fee_fixed,
      fee_per_addon_qty::text AS fee_per_addon_qty,
      scope_type,
      scope_id::text AS scope_id,
      metadata,
      priority,
      is_active
  `;
  if (!row) throw new Error("insertPackagingSlab failed");
  await bumpBillingRulesetVersion();
  return row;
}

export async function deletePackagingSlab(id: number): Promise<boolean> {
  const sql = getSql();
  const r = await sql`DELETE FROM billing_packaging_slabs WHERE id = ${id}`;
  const ok = (r as unknown as { count: number }).count > 0;
  if (ok) await bumpBillingRulesetVersion();
  return ok;
}

export async function getPackagingSlab(id: number): Promise<PackagingSlabRow | null> {
  const sql = getSql();
  const [row] = await sql<PackagingSlabRow[]>`
    SELECT
      id, name,
      min_cart::text AS min_cart,
      max_cart::text AS max_cart,
      fee_fixed::text AS fee_fixed,
      fee_per_addon_qty::text AS fee_per_addon_qty,
      scope_type,
      scope_id::text AS scope_id,
      metadata,
      priority,
      is_active
    FROM billing_packaging_slabs
    WHERE id = ${id}
    LIMIT 1
  `;
  return row ?? null;
}

export type PatchPackagingSlabInput = Partial<{
  name: string | null;
  min_cart: number | null;
  max_cart: number | null;
  fee_fixed: number;
  fee_per_addon_qty: number;
  scope_type: string;
  scope_id: number | null;
  metadata: unknown;
  priority: number;
  is_active: boolean;
}>;

export async function updatePackagingSlab(
  id: number,
  patch: PatchPackagingSlabInput
): Promise<PackagingSlabRow | null> {
  const cur = await getPackagingSlab(id);
  if (!cur) return null;
  const db = getSql();
  const name = patch.name !== undefined ? patch.name : cur.name;
  const minCart =
    patch.min_cart !== undefined ? patch.min_cart : cur.min_cart != null ? parseFloat(cur.min_cart) : null;
  const maxCart =
    patch.max_cart !== undefined ? patch.max_cart : cur.max_cart != null ? parseFloat(cur.max_cart) : null;
  const feeFixed =
    patch.fee_fixed !== undefined ? patch.fee_fixed : cur.fee_fixed != null ? parseFloat(cur.fee_fixed) : 0;
  const feePerAddon =
    patch.fee_per_addon_qty !== undefined
      ? patch.fee_per_addon_qty
      : cur.fee_per_addon_qty != null
        ? parseFloat(cur.fee_per_addon_qty)
        : 0;
  const scopeType = patch.scope_type !== undefined ? patch.scope_type : cur.scope_type;
  const scopeId =
    patch.scope_id !== undefined
      ? patch.scope_id
      : cur.scope_id != null && cur.scope_id !== ""
        ? parseInt(cur.scope_id, 10)
        : null;
  const metadata = patch.metadata !== undefined ? patch.metadata : cur.metadata;
  const priority = patch.priority !== undefined ? patch.priority : cur.priority;
  const isActive = patch.is_active !== undefined ? patch.is_active : cur.is_active;

  const [row] = await db<PackagingSlabRow[]>`
    UPDATE billing_packaging_slabs SET
      name = ${name},
      min_cart = ${minCart},
      max_cart = ${maxCart},
      fee_fixed = ${feeFixed},
      fee_per_addon_qty = ${feePerAddon},
      scope_type = ${scopeType},
      scope_id = ${scopeId},
      metadata = ${sqlJsonb(metadata)}::jsonb,
      priority = ${priority},
      is_active = ${isActive},
      updated_at = now()
    WHERE id = ${id}
    RETURNING
      id, name,
      min_cart::text AS min_cart,
      max_cart::text AS max_cart,
      fee_fixed::text AS fee_fixed,
      fee_per_addon_qty::text AS fee_per_addon_qty,
      scope_type,
      scope_id::text AS scope_id,
      metadata,
      priority,
      is_active
  `;
  if (!row) return null;
  await bumpBillingRulesetVersion();
  return row;
}

export type TaxConfigRow = {
  id: number;
  name: string;
  rate: string;
  applicable_base: string;
  tax_group: string | null;
  priority: number;
  is_active: boolean;
  is_hidden: boolean;
  service_type: string;
  metadata: unknown;
  /** True when `billing_tax_configs` exists but the linked TAX row in `billing_pricing_rules` was removed. */
  slab_missing: boolean;
  /** `billing_pricing_rules.id` for the TAX slab; null when `slab_missing`. */
  pricing_rule_id: number | null;
};

/**
 * Inserts the engine slab row for a tax config. Call only from explicit repair, update (when slab was
 * missing), or create — never from GET / list (that caused “ghost” rows after manual SQL deletes).
 */
export async function insertMissingTaxSlabRow(
  sql: ReturnType<typeof getSql>,
  taxConfigId: number,
  opts: {
    priority: number;
    is_active: boolean;
    is_hidden: boolean;
    service_type: string;
    metadata: unknown;
  }
): Promise<number> {
  const [t] = await sql<{ id: number; name: string; metadata: unknown; service_type: string }[]>`
    SELECT id, name, metadata, service_type FROM billing_tax_configs WHERE id = ${taxConfigId} LIMIT 1
  `;
  if (!t) throw new Error(`Tax config ${taxConfigId} not found`);

  const [dup] = await sql<{ id: number }[]>`
    SELECT id FROM billing_pricing_rules
    WHERE tax_config_id = ${taxConfigId} AND type = 'TAX'::billing_rule_type
    LIMIT 1
  `;
  if (dup) return dup.id;

  const chargeOrderKey = await nextChargeOrderKey(sql);
  const formulaJson = { formula_source: "billing_tax_configs" as const, tax_config_id: t.id };
  const st = opts.service_type.trim().toUpperCase();

  const [row] = await sql<{ id: number }[]>`
    INSERT INTO billing_pricing_rules (
      name, type, calculation_type, value_numeric, value_json,
      priority, charge_order_key, is_active, stackable, applies_to, offer_owner, is_hidden,
      metadata, service_type, tax_config_id
    ) VALUES (
      ${t.name},
      'TAX'::billing_rule_type,
      'FIXED'::billing_calculation_type,
      NULL,
      ${sqlJsonb(formulaJson)}::jsonb,
      ${opts.priority},
      ${chargeOrderKey},
      ${opts.is_active},
      true,
      'ORDER'::billing_applies_to,
      'GATIMITRA'::billing_offer_owner,
      ${opts.is_hidden},
      ${sqlJsonb(opts.metadata)}::jsonb,
      ${st},
      ${t.id}
    )
    RETURNING id::int AS id
  `;
  if (!row) throw new Error("insertMissingTaxSlabRow: insert failed");
  return row.id;
}

/** Create missing TAX slabs for all orphan tax configs (stable priorities after current max). */
export async function repairMissingTaxSlabs(): Promise<{ created: number }> {
  const sql = getSql();
  const orphans = await sql<{ id: number }[]>`
    SELECT t.id
    FROM billing_tax_configs t
    LEFT JOIN billing_pricing_rules r ON r.tax_config_id = t.id AND r.type = 'TAX'::billing_rule_type
    WHERE r.id IS NULL
    ORDER BY t.id ASC
  `;
  if (orphans.length === 0) return { created: 0 };

  const [{ mp }] = await sql<{ mp: number | null }[]>`
    SELECT COALESCE(MAX(priority), 0)::int AS mp FROM billing_pricing_rules
  `;
  let pNext = (mp ?? 0) + 10;
  let created = 0;

  for (const o of orphans) {
    const cur = await getTaxConfigRow(sql, o.id);
    if (!cur || !cur.slab_missing) continue;
    await insertMissingTaxSlabRow(sql, o.id, {
      priority: pNext,
      is_active: cur.is_active,
      is_hidden: cur.is_hidden,
      service_type: cur.service_type,
      metadata: cur.metadata,
    });
    pNext += 10;
    created++;
  }

  if (created > 0) await bumpBillingRulesetVersion();
  return { created };
}

async function getTaxConfigRow(sql: ReturnType<typeof getSql>, id: number): Promise<TaxConfigRow | null> {
  const [row] = await sql<TaxConfigRow[]>`
    SELECT
      t.id,
      t.name,
      t.rate::text AS rate,
      t.applicable_base::text AS applicable_base,
      t.tax_group::text AS tax_group,
      COALESCE(r.priority, (t.id::int * 10))::int AS priority,
      COALESCE(r.is_active, true) AS is_active,
      COALESCE(r.is_hidden, false) AS is_hidden,
      COALESCE(r.service_type, t.service_type, 'FOOD') AS service_type,
      t.metadata,
      (r.id IS NULL) AS slab_missing,
      r.id::int AS pricing_rule_id
    FROM billing_tax_configs t
    LEFT JOIN billing_pricing_rules r ON r.tax_config_id = t.id AND r.type = 'TAX'::billing_rule_type
    WHERE t.id = ${id}
    LIMIT 1
  `;
  return row ?? null;
}

export async function listTaxConfigs(): Promise<TaxConfigRow[]> {
  const sql = getSql();
  return sql<TaxConfigRow[]>`
    SELECT
      t.id,
      t.name,
      t.rate::text AS rate,
      t.applicable_base::text AS applicable_base,
      t.tax_group::text AS tax_group,
      COALESCE(r.priority, (t.id::int * 10))::int AS priority,
      COALESCE(r.is_active, true) AS is_active,
      COALESCE(r.is_hidden, false) AS is_hidden,
      COALESCE(r.service_type, t.service_type, 'FOOD') AS service_type,
      t.metadata,
      (r.id IS NULL) AS slab_missing,
      r.id::int AS pricing_rule_id
    FROM billing_tax_configs t
    LEFT JOIN billing_pricing_rules r ON r.tax_config_id = t.id AND r.type = 'TAX'::billing_rule_type
    ORDER BY COALESCE(r.charge_order_key, t.id::bigint * 100000) ASC, t.id ASC
  `;
}

export async function insertTaxConfig(input: {
  name: string;
  rate: number;
  applicable_base: string;
  tax_group?: string | null;
  priority?: number;
  is_active?: boolean;
  is_hidden?: boolean;
  service_type?: string;
  metadata?: unknown;
}): Promise<TaxConfigRow> {
  const db = getSql();
  const isActive = input.is_active ?? true;
  const isHidden = input.is_hidden ?? false;
  const serviceType = (input.service_type ?? "FOOD").trim().toUpperCase();

  const priority = await allocateUniqueBillingRulePriority(input.priority ?? 0);
  const chargeOrderKey = await nextChargeOrderKey(db);

  const tg =
    input.tax_group != null && String(input.tax_group).trim() !== ""
      ? String(input.tax_group).trim().toLowerCase()
      : null;

  const [t] = await db<{ id: number }[]>`
    INSERT INTO billing_tax_configs (name, rate, applicable_base, service_type, tax_group, metadata)
    VALUES (
      ${input.name},
      ${input.rate},
      ${input.applicable_base}::billing_tax_applicable_base,
      ${serviceType},
      ${tg}::billing_tax_group,
      ${sqlJsonb(input.metadata)}::jsonb
    )
    RETURNING id
  `;
  if (!t) throw new Error("insertTaxConfig failed");

  const formulaJson = { formula_source: "billing_tax_configs" as const, tax_config_id: t.id };

  await db`
    INSERT INTO billing_pricing_rules (
      name, type, calculation_type, value_numeric, value_json,
      priority, charge_order_key, is_active, stackable, applies_to, offer_owner, is_hidden,
      metadata, service_type, tax_config_id
    ) VALUES (
      ${input.name},
      'TAX'::billing_rule_type,
      'FIXED'::billing_calculation_type,
      NULL,
      ${sqlJsonb(formulaJson)}::jsonb,
      ${priority},
      ${chargeOrderKey},
      ${isActive},
      true,
      'ORDER'::billing_applies_to,
      'GATIMITRA'::billing_offer_owner,
      ${isHidden},
      ${sqlJsonb(input.metadata)}::jsonb,
      ${serviceType},
      ${t.id}
    )
  `;

  const row = await getTaxConfig(t.id);
  if (!row) throw new Error("insertTaxConfig: load failed");
  await bumpBillingRulesetVersion();
  return row;
}

export async function deleteTaxConfig(id: number): Promise<boolean> {
  const sql = getSql();
  /** Child rows reference tax_config_id; Postgres blocks deleting the parent unless we remove children first. */
  const ok = await sql.begin(async (tx) => {
    /** `TransactionSql` typings omit the template-tag call signature; runtime `tx` is callable. */
    const q = tx as unknown as ReturnType<typeof getSql>;
    await q`
      DELETE FROM billing_pricing_rules
      WHERE tax_config_id = ${id} AND type = 'TAX'::billing_rule_type
    `;
    const r = await q`DELETE FROM billing_tax_configs WHERE id = ${id}`;
    return (r as unknown as { count: number }).count > 0;
  });
  if (ok) await bumpBillingRulesetVersion();
  return ok;
}

export async function getTaxConfig(id: number): Promise<TaxConfigRow | null> {
  return getTaxConfigRow(getSql(), id);
}

export type PatchTaxConfigInput = Partial<{
  name: string;
  rate: number;
  applicable_base: string;
  tax_group: string | null;
  priority: number;
  is_active: boolean;
  is_hidden: boolean;
  service_type: string;
  metadata: unknown;
}>;

export async function updateTaxConfig(id: number, patch: PatchTaxConfigInput): Promise<TaxConfigRow | null> {
  const cur = await getTaxConfig(id);
  if (!cur) return null;
  const db = getSql();
  const name = patch.name !== undefined ? patch.name : cur.name;
  const rate = patch.rate !== undefined ? patch.rate : cur.rate != null ? parseFloat(cur.rate) : 0;
  const applicableBase = patch.applicable_base !== undefined ? patch.applicable_base : cur.applicable_base;
  const desiredPriority = patch.priority !== undefined ? patch.priority : cur.priority;
  const isActive = patch.is_active !== undefined ? patch.is_active : cur.is_active;
  const isHidden = patch.is_hidden !== undefined ? patch.is_hidden : cur.is_hidden;
  const serviceType =
    patch.service_type !== undefined
      ? patch.service_type.trim().toUpperCase()
      : (cur.service_type ?? "FOOD").trim().toUpperCase();
  const metadata = patch.metadata !== undefined ? patch.metadata : cur.metadata;
  const taxGroup =
    patch.tax_group !== undefined
      ? patch.tax_group != null && String(patch.tax_group).trim() !== ""
        ? String(patch.tax_group).trim().toLowerCase()
        : null
      : cur.tax_group;

  const priority = await allocateUniqueBillingRulePriority(desiredPriority);

  await db`
    UPDATE billing_tax_configs SET
      name = ${name},
      rate = ${rate},
      applicable_base = ${applicableBase}::billing_tax_applicable_base,
      service_type = ${serviceType},
      tax_group = ${taxGroup}::billing_tax_group,
      metadata = ${sqlJsonb(metadata)}::jsonb,
      updated_at = now()
    WHERE id = ${id}
  `;

  if (cur.slab_missing) {
    await insertMissingTaxSlabRow(db, id, {
      priority,
      is_active: isActive,
      is_hidden: isHidden,
      service_type: serviceType,
      metadata,
    });
  }

  const [taxRule] = await db<{ id: number }[]>`
    SELECT id FROM billing_pricing_rules
    WHERE tax_config_id = ${id} AND type = 'TAX'::billing_rule_type
    LIMIT 1
  `;
  if (!taxRule) return null;
  const chargeOrderKey = priority * 1_000_000 + taxRule.id;

  await db`
    UPDATE billing_pricing_rules SET
      name = ${name},
      priority = ${priority},
      charge_order_key = ${chargeOrderKey},
      is_active = ${isActive},
      is_hidden = ${isHidden},
      service_type = ${serviceType},
      metadata = ${sqlJsonb(metadata)}::jsonb,
      value_json = ${sqlJsonb({ formula_source: "billing_tax_configs" as const, tax_config_id: id })}::jsonb,
      updated_at = now()
    WHERE tax_config_id = ${id} AND type = 'TAX'::billing_rule_type
  `;

  const row = await getTaxConfig(id);
  if (!row) return null;
  await bumpBillingRulesetVersion();
  return row;
}

export type DiscountRow = {
  id: number;
  code: string;
  discount_type: string;
  value_numeric: string | null;
  max_discount_cap: string | null;
  usage_limit: number | null;
  used_count: number;
  is_active: boolean;
  is_hidden: boolean;
  metadata: unknown;
};

export async function listDiscounts(): Promise<DiscountRow[]> {
  const sql = getSql();
  return sql<DiscountRow[]>`
    SELECT
      id,
      code,
      discount_type::text AS discount_type,
      value_numeric::text AS value_numeric,
      max_discount_cap::text AS max_discount_cap,
      usage_limit,
      used_count,
      is_active,
      is_hidden,
      metadata
    FROM billing_discounts
    ORDER BY id ASC
  `;
}

export async function insertDiscount(input: {
  code: string;
  discount_type: string;
  value_numeric?: number | null;
  max_discount_cap?: number | null;
  usage_limit?: number | null;
  is_active?: boolean;
  is_hidden?: boolean;
  metadata?: unknown;
}): Promise<DiscountRow> {
  const db = getSql();
  const [row] = await db<DiscountRow[]>`
    INSERT INTO billing_discounts (
      code, discount_type, value_numeric, max_discount_cap, usage_limit, is_active, is_hidden, metadata
    ) VALUES (
      ${input.code.trim()},
      ${input.discount_type}::billing_discount_type,
      ${input.value_numeric ?? null},
      ${input.max_discount_cap ?? null},
      ${input.usage_limit ?? null},
      ${input.is_active ?? true},
      ${input.is_hidden ?? false},
      ${sqlJsonb(input.metadata)}::jsonb
    )
    RETURNING
      id,
      code,
      discount_type::text AS discount_type,
      value_numeric::text AS value_numeric,
      max_discount_cap::text AS max_discount_cap,
      usage_limit,
      used_count,
      is_active,
      is_hidden,
      metadata
  `;
  if (!row) throw new Error("insertDiscount failed");
  await bumpBillingRulesetVersion();
  return row;
}

export async function deleteDiscount(id: number): Promise<boolean> {
  const sql = getSql();
  const r = await sql`DELETE FROM billing_discounts WHERE id = ${id}`;
  const ok = (r as unknown as { count: number }).count > 0;
  if (ok) await bumpBillingRulesetVersion();
  return ok;
}

export async function getDiscount(id: number): Promise<DiscountRow | null> {
  const sql = getSql();
  const [row] = await sql<DiscountRow[]>`
    SELECT
      id,
      code,
      discount_type::text AS discount_type,
      value_numeric::text AS value_numeric,
      max_discount_cap::text AS max_discount_cap,
      usage_limit,
      used_count,
      is_active,
      is_hidden,
      metadata
    FROM billing_discounts
    WHERE id = ${id}
    LIMIT 1
  `;
  return row ?? null;
}

export type PatchDiscountInput = Partial<{
  code: string;
  discount_type: string;
  value_numeric: number | null;
  max_discount_cap: number | null;
  usage_limit: number | null;
  is_active: boolean;
  is_hidden: boolean;
  metadata: unknown;
}>;

export async function updateDiscount(id: number, patch: PatchDiscountInput): Promise<DiscountRow | null> {
  const cur = await getDiscount(id);
  if (!cur) return null;
  const db = getSql();
  const code =
    patch.code !== undefined ? patch.code.trim() : cur.code;
  const discountType = patch.discount_type !== undefined ? patch.discount_type : cur.discount_type;
  const valueNumeric =
    patch.value_numeric !== undefined
      ? patch.value_numeric
      : cur.value_numeric != null && cur.value_numeric !== ""
        ? parseFloat(cur.value_numeric)
        : null;
  const maxCap =
    patch.max_discount_cap !== undefined
      ? patch.max_discount_cap
      : cur.max_discount_cap != null && cur.max_discount_cap !== ""
        ? parseFloat(cur.max_discount_cap)
        : null;
  const usageLimit = patch.usage_limit !== undefined ? patch.usage_limit : cur.usage_limit;
  const isActive = patch.is_active !== undefined ? patch.is_active : cur.is_active;
  const isHidden = patch.is_hidden !== undefined ? patch.is_hidden : cur.is_hidden;
  const metadata = patch.metadata !== undefined ? patch.metadata : cur.metadata;

  const [row] = await db<DiscountRow[]>`
    UPDATE billing_discounts SET
      code = ${code},
      discount_type = ${discountType}::billing_discount_type,
      value_numeric = ${valueNumeric},
      max_discount_cap = ${maxCap},
      usage_limit = ${usageLimit},
      is_active = ${isActive},
      is_hidden = ${isHidden},
      metadata = ${sqlJsonb(metadata)}::jsonb,
      updated_at = now()
    WHERE id = ${id}
    RETURNING
      id,
      code,
      discount_type::text AS discount_type,
      value_numeric::text AS value_numeric,
      max_discount_cap::text AS max_discount_cap,
      usage_limit,
      used_count,
      is_active,
      is_hidden,
      metadata
  `;
  if (!row) return null;
  await bumpBillingRulesetVersion();
  return row;
}

export type MerchantOverrideRow = {
  id: number;
  merchant_store_id: string;
  overrides: unknown;
  updated_at: string;
};

export async function getMerchantOverride(merchantStoreId: number): Promise<MerchantOverrideRow | null> {
  const sql = getSql();
  const [row] = await sql<MerchantOverrideRow[]>`
    SELECT id, merchant_store_id::text AS merchant_store_id, overrides, updated_at::text AS updated_at
    FROM merchant_billing_overrides
    WHERE merchant_store_id = ${merchantStoreId}
    LIMIT 1
  `;
  return row ?? null;
}

export async function upsertMerchantOverride(merchantStoreId: number, overrides: unknown): Promise<void> {
  const db = getSql();
  await db`
    INSERT INTO merchant_billing_overrides (merchant_store_id, overrides, updated_at)
    VALUES (${merchantStoreId}, ${sqlJsonb(overrides)}::jsonb, now())
    ON CONFLICT (merchant_store_id)
    DO UPDATE SET overrides = EXCLUDED.overrides, updated_at = now()
  `;
  await bumpBillingRulesetVersion();
}
