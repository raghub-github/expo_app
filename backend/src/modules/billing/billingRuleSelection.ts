import type { RuleRow, TaxConfigRow } from "./types.js";

/** Charge types that should apply at most once per service line in the pipeline. */
export const SINGLETON_CHARGE_RULE_TYPES = new Set([
  "PLATFORM_FEE",
  "CONVENIENCE_FEE",
  "DELIVERY",
  "PACKAGING",
  "SMALL_ORDER_FEE",
  "SURGE",
]);

function taxConfigScopeKey(t: TaxConfigRow): string {
  return `${String(t.applicableBase ?? "").trim().toUpperCase()}:${String(t.taxGroup ?? "").trim().toLowerCase()}`;
}

/** Prefer RIDE/PARCEL/FOOD-specific rules over ALL when both exist for the same charge type. */
export function preferServiceSpecificBillingRules(rules: RuleRow[], serviceType: string): RuleRow[] {
  const st = serviceType.trim().toUpperCase();
  if (st === "ALL") return rules;
  const specificTypes = new Set(rules.filter((r) => r.serviceType === st).map((r) => r.type));
  return rules.filter((r) => !(r.serviceType === "ALL" && specificTypes.has(r.type)));
}

/** Keep only the first active rule per singleton charge type (by charge_order_key). */
export function dedupeSingletonChargeRules(rules: RuleRow[]): RuleRow[] {
  const seen = new Set<string>();
  const sorted = [...rules].sort(
    (a, b) => a.chargeOrderKey - b.chargeOrderKey || a.priority - b.priority || a.id - b.id
  );
  const out: RuleRow[] = [];
  for (const r of sorted) {
    if (!SINGLETON_CHARGE_RULE_TYPES.has(r.type)) {
      out.push(r);
      continue;
    }
    const key = `${r.serviceType}:${r.type}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(r);
  }
  return out;
}

/** Prefer service-specific tax slabs over ALL for the same applicable base + tax group. */
export function preferServiceSpecificTaxConfigs(
  taxConfigs: TaxConfigRow[],
  serviceType: string
): TaxConfigRow[] {
  const st = serviceType.trim().toUpperCase();
  if (st === "ALL") return taxConfigs;
  const specificKeys = new Set(
    taxConfigs.filter((t) => t.serviceType === st).map((t) => taxConfigScopeKey(t))
  );
  return taxConfigs.filter((t) => !(t.serviceType === "ALL" && specificKeys.has(taxConfigScopeKey(t))));
}

export function narrowBillingRulesForService(rules: RuleRow[], serviceType: string): RuleRow[] {
  const scoped = rules.filter((r) => r.serviceType === serviceType || r.serviceType === "ALL");
  return dedupeSingletonChargeRules(preferServiceSpecificBillingRules(scoped, serviceType));
}

export function narrowTaxConfigsForService(
  taxConfigs: TaxConfigRow[],
  serviceType: string
): TaxConfigRow[] {
  const scoped = taxConfigs.filter((t) => t.serviceType === serviceType || t.serviceType === "ALL");
  return preferServiceSpecificTaxConfigs(scoped, serviceType);
}
