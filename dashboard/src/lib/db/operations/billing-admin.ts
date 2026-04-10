import { logBillingCharge } from "@/lib/billing-charge-order";
import { getSql } from "../client";

/**
 * JSON text for `... VALUES (${sqlJsonb(v)}::jsonb)` fragments.
 * We avoid `sql.json()` here: Next/webpack can bundle `postgres` twice so `Parameter` from `sql.json`
 * is not recognized and gets passed to Buffer as a plain Object (ERR_INVALID_ARG_TYPE).
 */
export function sqlJsonb(v: unknown): string | null {
  if (v == null) return null;
  try {
    const s = JSON.stringify(v, (_, val) => (typeof val === "bigint" ? val.toString() : val));
    if (s === undefined) return null;
    return s;
  } catch {
    return null;
  }
}

export async function bumpBillingRulesetVersion(): Promise<void> {
  const sql = getSql();
  await sql`
    UPDATE billing_ruleset_version
    SET version = version + 1, updated_at = now()
    WHERE id = 1
  `;
}

export type BillingRuleAdminRow = {
  id: number;
  name: string | null;
  type: string;
  calculation_type: string;
  value_numeric: string | null;
  value_json: unknown;
  priority: number;
  is_active: boolean;
  stackable: boolean;
  applies_to: string;
  offer_owner: string;
  is_hidden: boolean;
  metadata: unknown;
  service_type: string;
  discount_applies_on: string;
  charge_subtype: string | null;
  created_at: string;
  updated_at: string;
};

export async function listBillingRules(): Promise<BillingRuleAdminRow[]> {
  const sql = getSql();
  return sql<BillingRuleAdminRow[]>`
    SELECT
      id,
      name,
      type::text AS type,
      calculation_type::text AS calculation_type,
      value_numeric::text AS value_numeric,
      value_json,
      priority,
      is_active,
      stackable,
      applies_to::text AS applies_to,
      offer_owner::text AS offer_owner,
      is_hidden,
      metadata,
      service_type,
      discount_applies_on::text AS discount_applies_on,
      charge_subtype,
      created_at::text AS created_at,
      updated_at::text AS updated_at
    FROM billing_pricing_rules
    WHERE type::text <> 'TAX'
    ORDER BY charge_order_key ASC, id ASC
  `;
}

export async function getBillingRule(id: number): Promise<BillingRuleAdminRow | null> {
  const sql = getSql();
  const [row] = await sql<BillingRuleAdminRow[]>`
    SELECT
      id,
      name,
      type::text AS type,
      calculation_type::text AS calculation_type,
      value_numeric::text AS value_numeric,
      value_json,
      priority,
      is_active,
      stackable,
      applies_to::text AS applies_to,
      offer_owner::text AS offer_owner,
      is_hidden,
      metadata,
      service_type,
      discount_applies_on::text AS discount_applies_on,
      charge_subtype,
      created_at::text AS created_at,
      updated_at::text AS updated_at
    FROM billing_pricing_rules
    WHERE id = ${id}
    LIMIT 1
  `;
  return row ?? null;
}

export type InsertBillingRuleInput = {
  name?: string | null;
  type: string;
  calculation_type: string;
  value_numeric?: number | null;
  value_json?: unknown;
  priority?: number;
  is_active?: boolean;
  stackable?: boolean;
  applies_to?: string;
  offer_owner?: string;
  is_hidden?: boolean;
  metadata?: unknown;
  service_type?: string;
  discount_applies_on?: string;
  charge_subtype?: string | null;
};

function sanitizeNumeric(v: number | null | undefined): number | null {
  if (v == null) return null;
  if (typeof v === "number" && Number.isNaN(v)) return null;
  return v;
}

/** API may send jsonb as a JSON string; postgres.js sql.json() must receive parsed objects for jsonb objects. */
function normalizeJsonbInput(v: unknown): unknown {
  if (v == null) return null;
  if (typeof v === "string") {
    const t = v.trim();
    if (!t) return null;
    try {
      return JSON.parse(t) as unknown;
    } catch {
      return v;
    }
  }
  return v;
}

function normalizePriorityInput(v: unknown): number {
  if (v == null) return 100;
  const n = typeof v === "number" ? v : parseInt(String(v), 10);
  if (!Number.isFinite(n) || n < 1) return 100;
  return Math.min(Math.floor(n), 2147483647);
}

/** Engine contract: formula rules must carry the right `value_json.key` (see backend applyRule.ts). */
function ensureFormulaValueJson(
  ruleType: string,
  calcType: string,
  offerOwner: string,
  valueJson: unknown
): unknown {
  if (calcType !== "FORMULA_KEY") return valueJson;
  if (ruleType === "PACKAGING") {
    return { key: "MERCHANT_PACKAGING" };
  }
  if (ruleType === "DELIVERY") {
    const k = (valueJson as { key?: string } | null)?.key;
    if (k === "DELIVERY_SLAB" || k === "DELIVERY_RATE_CARD" || k === "MERCHANT_PER_KM") {
      return { key: k };
    }
    return { key: "DELIVERY_RATE_CARD" };
  }
  if (ruleType === "OFFER" && offerOwner === "MERCHANT") {
    return { key: "MERCHANT_OFFER_REF" };
  }
  return valueJson;
}

function normalizeRuleInput(
  input: InsertBillingRuleInput
): InsertBillingRuleInput & { applies_to: string; offer_owner: string; service_type: string } {
  const ruleType = String(input.type ?? "").trim().toUpperCase();
  const calcType = String(input.calculation_type ?? "").trim().toUpperCase();
  const offerOwner = String(input.offer_owner ?? "GATIMITRA").trim().toUpperCase();
  const appliesTo = String(input.applies_to ?? "ORDER").trim().toUpperCase();
  const serviceType = (input.service_type ?? "FOOD").trim().toUpperCase();
  let valueJson = normalizeJsonbInput(input.value_json);
  valueJson = ensureFormulaValueJson(ruleType, calcType, offerOwner, valueJson);
  const discountAppliesOn = String(input.discount_applies_on ?? "ITEMS_TOTAL").trim().toUpperCase();
  return {
    ...input,
    type: ruleType,
    calculation_type: calcType,
    offer_owner: offerOwner,
    applies_to: appliesTo,
    service_type: serviceType,
    discount_applies_on: discountAppliesOn,
    value_json: valueJson,
    metadata: normalizeJsonbInput(input.metadata),
  };
}

/** Next slot after current max `charge_order_key` (batch updates use dense 100k steps). */
export async function nextChargeOrderKey(sql: ReturnType<typeof getSql>): Promise<number> {
  const [{ m }] = await sql<{ m: string | null }[]>`
    SELECT (COALESCE(MAX(charge_order_key), 0) + 100000)::text AS m
    FROM billing_pricing_rules
  `;
  const n = m != null ? Number(m) : 100000;
  return Number.isFinite(n) ? n : 100000;
}

/**
 * Human-facing `priority` is no longer globally unique (see migration 0181).
 * Engine order uses `charge_order_key`; this only clamps the form/API value.
 */
export async function allocateUniqueBillingRulePriority(desired: number, _excludeRuleId?: number): Promise<number> {
  void _excludeRuleId;
  return normalizePriorityInput(desired);
}

export async function insertBillingRule(input: InsertBillingRuleInput): Promise<BillingRuleAdminRow> {
  const db = getSql();
  const n = normalizeRuleInput(input);

  const priority = normalizePriorityInput(n.priority);
  const chargeOrderKey = await nextChargeOrderKey(db);

  const isActive = n.is_active ?? true;
  const stackable = n.stackable ?? true;
  const isHidden = n.is_hidden ?? false;
  const valueNumeric = sanitizeNumeric(n.value_numeric ?? null);
  const chargeSubtype: string | null =
    n.charge_subtype != null && String(n.charge_subtype).trim() !== "" ? String(n.charge_subtype).trim() : null;
  const discountAppliesOn = String(n.discount_applies_on ?? "ITEMS_TOTAL");

  const [row] = await db<BillingRuleAdminRow[]>`
    INSERT INTO billing_pricing_rules (
      name, type, calculation_type, value_numeric, value_json, priority, charge_order_key, is_active, stackable, applies_to, offer_owner, is_hidden, metadata, service_type,
      discount_applies_on, charge_subtype,
      tax_config_id
    ) VALUES (
      ${n.name ?? null},
      ${n.type}::billing_rule_type,
      ${n.calculation_type}::billing_calculation_type,
      ${valueNumeric},
      ${sqlJsonb(n.value_json)}::jsonb,
      ${priority},
      ${chargeOrderKey},
      ${isActive},
      ${stackable},
      ${n.applies_to}::billing_applies_to,
      ${n.offer_owner}::billing_offer_owner,
      ${isHidden},
      ${sqlJsonb(n.metadata)}::jsonb,
      ${n.service_type},
      ${discountAppliesOn}::billing_discount_applies_on,
      ${chargeSubtype},
      NULL
    )
    RETURNING
      id, name,
      type::text AS type,
      calculation_type::text AS calculation_type,
      value_numeric::text AS value_numeric,
      value_json,
      priority, is_active, stackable,
      applies_to::text AS applies_to,
      offer_owner::text AS offer_owner,
      is_hidden,
      metadata,
      service_type,
      discount_applies_on::text AS discount_applies_on,
      charge_subtype,
      created_at::text AS created_at,
      updated_at::text AS updated_at
  `;
  if (!row) throw new Error("insertBillingRule failed");
  await bumpBillingRulesetVersion();
  return row;
}

export async function updateBillingRuleFull(id: number, input: InsertBillingRuleInput): Promise<BillingRuleAdminRow | null> {
  const db = getSql();
  const existing = await getBillingRule(id);
  if (!existing) return null;

  const n = normalizeRuleInput(input);

  const prevSt = (existing.service_type ?? "FOOD").trim().toUpperCase();
  const existingType = (existing.type ?? "").trim().toUpperCase();
  const existingOffer = (existing.offer_owner ?? "GATIMITRA").trim().toUpperCase();

  const identityChanged =
    existingType !== n.type ||
    prevSt !== n.service_type ||
    (n.type === "OFFER" && existingOffer !== n.offer_owner);
  void identityChanged;

  const priority = normalizePriorityInput(n.priority);
  const [prevRow] = await db<{ priority: number; charge_order_key: string }[]>`
    SELECT priority, charge_order_key::text AS charge_order_key
    FROM billing_pricing_rules WHERE id = ${id} LIMIT 1
  `;
  const prevP = Number(prevRow?.priority ?? 0);
  let chargeOrderKey =
    prevRow?.charge_order_key != null ? Number(prevRow.charge_order_key) : await nextChargeOrderKey(db);
  if (priority !== prevP) {
    chargeOrderKey = priority * 1_000_000 + id;
  }

  const isActive = n.is_active ?? true;
  const stackable = n.stackable ?? true;
  const isHidden = n.is_hidden ?? false;
  const valueNumeric = sanitizeNumeric(n.value_numeric ?? null);
  const chargeSubtype: string | null =
    n.charge_subtype != null && String(n.charge_subtype).trim() !== "" ? String(n.charge_subtype).trim() : null;
  const discountAppliesOn = String(n.discount_applies_on ?? "ITEMS_TOTAL");

  const [row] = await db<BillingRuleAdminRow[]>`
    UPDATE billing_pricing_rules SET
      name = ${n.name ?? null},
      type = ${n.type}::billing_rule_type,
      calculation_type = ${n.calculation_type}::billing_calculation_type,
      value_numeric = ${valueNumeric},
      value_json = ${sqlJsonb(n.value_json)}::jsonb,
      priority = ${priority},
      charge_order_key = ${chargeOrderKey},
      is_active = ${isActive},
      stackable = ${stackable},
      applies_to = ${n.applies_to}::billing_applies_to,
      offer_owner = ${n.offer_owner}::billing_offer_owner,
      is_hidden = ${isHidden},
      metadata = ${sqlJsonb(n.metadata)}::jsonb,
      service_type = ${n.service_type},
      discount_applies_on = ${discountAppliesOn}::billing_discount_applies_on,
      charge_subtype = ${chargeSubtype},
      updated_at = now()
    WHERE id = ${id}
    RETURNING
      id, name,
      type::text AS type,
      calculation_type::text AS calculation_type,
      value_numeric::text AS value_numeric,
      value_json,
      priority, is_active, stackable,
      applies_to::text AS applies_to,
      offer_owner::text AS offer_owner,
      is_hidden,
      metadata,
      service_type,
      discount_applies_on::text AS discount_applies_on,
      charge_subtype,
      created_at::text AS created_at,
      updated_at::text AS updated_at
  `;
  if (!row) return null;
  await bumpBillingRulesetVersion();
  return row;
}

export async function deleteBillingRule(id: number): Promise<boolean> {
  const sql = getSql();
  const r = await sql`DELETE FROM billing_pricing_rules WHERE id = ${id}`;
  if ((r as { count: number }).count > 0) await bumpBillingRulesetVersion();
  return (r as { count: number }).count > 0;
}

export async function updateBillingRulePriorities(orderedIds: number[]): Promise<void> {
  const sql = getSql();
  if (orderedIds.length === 0) return;
  const priorities = orderedIds.map((_, i) => (i + 1) * 10);
  const keys = orderedIds.map((_, i) => (i + 1) * 100000);
  await sql`
    UPDATE billing_pricing_rules AS r
    SET priority = v.new_p,
        charge_order_key = v.new_k::bigint,
        updated_at = now()
    FROM (
      SELECT * FROM unnest(
        ${sql.array(orderedIds, 23)}::int4[],
        ${sql.array(priorities, 23)}::int4[],
        ${sql.array(keys, 20)}::int8[]
      ) AS t(id, new_p, new_k)
    ) AS v
    WHERE r.id = v.id
  `;
  await bumpBillingRulesetVersion();
}

/** Mixed rule + tax slab rows share `charge_order_key` on `billing_pricing_rules`. */
export type BillingChargeOrderRowRef = { kind: "rule" | "tax"; id: number };

/**
 * Merge UI-visible row order into the full global list: rows not in the payload keep their relative
 * positions; renumbered `charge_order_key` + `priority` are written in one UPDATE (no unique collisions).
 */
export async function reorderBillingChargeOrder(ordered: BillingChargeOrderRowRef[]): Promise<void> {
  if (ordered.length === 0) return;
  const sql = getSql();

  const resolveToPricingRuleIds = async (q: ReturnType<typeof getSql>): Promise<number[]> => {
    const seen = new Set<number>();
    const resolved: number[] = [];
    for (const row of ordered) {
      if (row.kind === "rule") {
        const [r] = await q<{ id: number }[]>`
          SELECT id::int AS id FROM billing_pricing_rules
          WHERE id = ${row.id} AND type <> 'TAX'::billing_rule_type
          LIMIT 1
        `;
        if (!r) throw new Error(`Unknown billing rule id ${row.id}`);
        if (seen.has(r.id)) throw new Error("Duplicate rule in charge order");
        seen.add(r.id);
        resolved.push(r.id);
      } else {
        const [r] = await q<{ id: number }[]>`
          SELECT id::int AS id FROM billing_pricing_rules
          WHERE tax_config_id = ${row.id} AND type = 'TAX'::billing_rule_type
          LIMIT 1
        `;
        if (!r) throw new Error(`Unknown tax config id ${row.id} (missing TAX slab row)`);
        if (seen.has(r.id)) throw new Error("Duplicate tax slab in charge order");
        seen.add(r.id);
        resolved.push(r.id);
      }
    }
    return resolved;
  };

  await sql.begin(async (tx) => {
    const q = tx as unknown as ReturnType<typeof getSql>;
    const visibleOrdered = await resolveToPricingRuleIds(q);
    const visSet = new Set(visibleOrdered);

    const allRows = await q<{ id: number }[]>`
      SELECT id::int AS id
      FROM billing_pricing_rules
      ORDER BY charge_order_key ASC, id ASC
    `;
    const fullIds = allRows.map((r) => r.id);

    for (const id of visibleOrdered) {
      if (!fullIds.includes(id)) {
        throw new Error(`Pricing rule row ${id} missing from billing_pricing_rules`);
      }
    }

    const visibleInFull = fullIds.filter((id) => visSet.has(id));
    if (visibleInFull.length !== visibleOrdered.length) {
      throw new Error(
        `Charge order mismatch: sent ${visibleOrdered.length} keys but ${visibleInFull.length} rows match in DB`
      );
    }
    const bag = new Map<number, number>();
    for (const id of visibleInFull) bag.set(id, (bag.get(id) ?? 0) + 1);
    for (const id of visibleOrdered) {
      const c = bag.get(id) ?? 0;
      if (c <= 0) throw new Error(`Charge order multiset mismatch for id ${id}`);
      bag.set(id, c - 1);
    }

    let vo = 0;
    const merged: number[] = [];
    for (const id of fullIds) {
      if (visSet.has(id)) {
        const nextId = visibleOrdered[vo++];
        if (nextId === undefined) throw new Error("Charge order merge underrun");
        merged.push(nextId);
      } else {
        merged.push(id);
      }
    }
    if (vo !== visibleOrdered.length) throw new Error("Charge order merge overrun");

    const newKeys = merged.map((_, i) => (i + 1) * 100000);
    const newPriorities = merged.map((_, i) => (i + 1) * 10);

    await q`
      UPDATE billing_pricing_rules AS r
      SET
        charge_order_key = v.k::bigint,
        priority = v.p,
        updated_at = now()
      FROM (
        SELECT * FROM unnest(
          ${sql.array(merged, 23)}::int4[],
          ${sql.array(newKeys, 20)}::int8[],
          ${sql.array(newPriorities, 23)}::int4[]
        ) AS t(id, k, p)
      ) AS v
      WHERE r.id = v.id
    `;
  });

  await bumpBillingRulesetVersion();
  logBillingCharge("reorderBillingChargeOrder", "transaction committed + ruleset version bumped", {
    inputLen: ordered.length,
  });
}

export type BillingConditionAdminRow = {
  id: number;
  rule_id: number;
  condition_type: string;
  operator: string;
  value_min: string | null;
  value_max: string | null;
  value_text: string | null;
  value_json: unknown;
};

export async function listBillingConditions(ruleId: number): Promise<BillingConditionAdminRow[]> {
  const sql = getSql();
  return sql<BillingConditionAdminRow[]>`
    SELECT
      id,
      rule_id,
      condition_type::text AS condition_type,
      operator::text AS operator,
      value_min::text AS value_min,
      value_max::text AS value_max,
      value_text,
      value_json
    FROM billing_pricing_rule_conditions
    WHERE rule_id = ${ruleId}
    ORDER BY id ASC
  `;
}

export type InsertBillingConditionInput = {
  condition_type: string;
  operator: string;
  value_min?: number | null;
  value_max?: number | null;
  value_text?: string | null;
  value_json?: unknown;
};

export async function insertBillingCondition(
  ruleId: number,
  input: InsertBillingConditionInput
): Promise<BillingConditionAdminRow> {
  const db = getSql();
  const [row] = await db<BillingConditionAdminRow[]>`
    INSERT INTO billing_pricing_rule_conditions (
      rule_id, condition_type, operator, value_min, value_max, value_text, value_json
    ) VALUES (
      ${ruleId},
      ${input.condition_type}::billing_condition_type,
      ${input.operator}::billing_condition_operator,
      ${input.value_min ?? null},
      ${input.value_max ?? null},
      ${input.value_text ?? null},
      ${sqlJsonb(input.value_json)}::jsonb
    )
    RETURNING
      id,
      rule_id,
      condition_type::text AS condition_type,
      operator::text AS operator,
      value_min::text AS value_min,
      value_max::text AS value_max,
      value_text,
      value_json
  `;
  if (!row) throw new Error("insertBillingCondition failed");
  await bumpBillingRulesetVersion();
  return row;
}

export async function deleteBillingCondition(conditionId: number): Promise<boolean> {
  const sql = getSql();
  const r = await sql`DELETE FROM billing_pricing_rule_conditions WHERE id = ${conditionId}`;
  await bumpBillingRulesetVersion();
  return r.count > 0;
}
