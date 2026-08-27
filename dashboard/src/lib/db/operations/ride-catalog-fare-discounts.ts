import { getSql } from "../client";
import { bumpBillingRulesetVersion, sqlJsonb } from "./billing-admin";
import {
  RIDE_CATALOG_FARE_DISCOUNT_DEFAULT_INR,
  RIDE_CATALOG_FARE_DISCOUNT_DEFS,
  type RideCatalogFareDiscountRow,
} from "@/lib/ride-catalog-fare-discounts";

function roundInr(n: unknown): number {
  const v = typeof n === "number" ? n : parseFloat(String(n ?? ""));
  if (!Number.isFinite(v) || v < 0) return RIDE_CATALOG_FARE_DISCOUNT_DEFAULT_INR;
  return Math.round(v * 100) / 100;
}

export async function listRideCatalogFareDiscounts(): Promise<RideCatalogFareDiscountRow[]> {
  const sql = getSql();
  const subtypes = RIDE_CATALOG_FARE_DISCOUNT_DEFS.map((d) => d.subtype);
  const rows = await sql<{ charge_subtype: string; value_numeric: string | number | null }[]>`
    SELECT charge_subtype, value_numeric
    FROM billing_pricing_rules
    WHERE upper(trim(service_type)) = 'RIDE'
      AND type = 'DISCOUNT'
      AND charge_subtype IN ${sql(subtypes)}
    ORDER BY id ASC
  `;
  const bySubtype = new Map<string, number>();
  for (const row of rows) {
    const subtype = String(row.charge_subtype ?? "").trim();
    if (!subtype || bySubtype.has(subtype)) continue;
    const amount = roundInr(row.value_numeric);
    bySubtype.set(subtype, amount > 0 ? amount : RIDE_CATALOG_FARE_DISCOUNT_DEFAULT_INR);
  }
  return RIDE_CATALOG_FARE_DISCOUNT_DEFS.map((def) => ({
    catalogCode: def.catalogCode,
    parentCatalogCode: def.parentCatalogCode,
    label: def.label,
    parentLabel: def.parentLabel,
    amountInr: bySubtype.get(def.subtype) ?? RIDE_CATALOG_FARE_DISCOUNT_DEFAULT_INR,
  }));
}

export async function saveRideCatalogFareDiscounts(
  amounts: Record<string, number>
): Promise<RideCatalogFareDiscountRow[]> {
  const sql = getSql();

  for (const def of RIDE_CATALOG_FARE_DISCOUNT_DEFS) {
    const raw = amounts[def.catalogCode];
    if (raw == null || !Number.isFinite(raw)) continue;
    const amount = Math.min(500, Math.max(0, Math.round(raw * 100) / 100));

    const updated = await sql<{ id: number }[]>`
      UPDATE billing_pricing_rules
      SET value_numeric = ${amount}, updated_at = NOW()
      WHERE upper(trim(service_type)) = 'RIDE'
        AND charge_subtype = ${def.subtype}
      RETURNING id
    `;

    if (updated.length > 0) continue;

    const [prio] = await sql<{ next_p: number }[]>`
      SELECT COALESCE(MAX(priority), 0) + 10 AS next_p FROM billing_pricing_rules
    `;
    await sql`
      INSERT INTO billing_pricing_rules (
        name, type, calculation_type, value_numeric, value_json,
        priority, is_active, stackable, applies_to, offer_owner, is_hidden,
        metadata, service_type, discount_applies_on, charge_subtype, tax_config_id
      ) VALUES (
        ${`${def.label} discount (config only — do not activate)`},
        'DISCOUNT'::billing_rule_type,
        'FIXED'::billing_calculation_type,
        ${amount},
        '{}'::jsonb,
        ${prio?.next_p ?? 10},
        false, true, 'ORDER'::billing_applies_to,
        'GATIMITRA'::billing_offer_owner, true,
        ${sqlJsonb({
          source: "ride_catalog_fare_offsets_admin",
          catalog_code: def.catalogCode,
          parent_catalog_code: def.parentCatalogCode,
          consumer: "loadCatalogFareOffsets",
          do_not_activate: true,
        })}::jsonb,
        'RIDE',
        'ITEMS_TOTAL'::billing_discount_applies_on,
        ${def.subtype},
        NULL
      )
    `;
  }

  await bumpBillingRulesetVersion();
  return listRideCatalogFareDiscounts();
}
