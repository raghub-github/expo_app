import type { GeoAncestorStep, GeoPricingRuleRow } from "@/lib/geo/geo-shared";
import { geoPricingRefKey } from "@/lib/geo/geo-shared";

export type GeoEffectiveRule = {
  service: string;
  ruleType: string;
  valueNumeric: string | null;
  source: GeoAncestorStep;
  ruleId: string;
  priority: number;
};

/**
 * Nearest ancestor wins: walk from current node up to state; first active rule
 * for (service, rule_type) applies.
 */
export function resolveGeoEffectiveRules(
  chain: GeoAncestorStep[],
  rulesByRef: Record<string, GeoPricingRuleRow[]>
): GeoEffectiveRule[] {
  const comboKeys = new Set<string>();
  for (const rules of Object.values(rulesByRef)) {
    for (const r of rules) {
      if (r.is_active) comboKeys.add(`${r.service}\t${r.rule_type}`);
    }
  }

  const out: GeoEffectiveRule[] = [];
  const fromCurrentUp = [...chain].reverse();

  for (const key of comboKeys) {
    const tab = key.indexOf("\t");
    const service = key.slice(0, tab);
    const ruleType = key.slice(tab + 1);

    for (const step of fromCurrentUp) {
      const k = geoPricingRefKey(step);
      const rules = rulesByRef[k] ?? [];
      const same = rules.filter(
        (r) => r.is_active && r.service === service && r.rule_type === ruleType
      );
      const hit = same.sort((a, b) => b.priority - a.priority)[0];
      if (hit != null) {
        out.push({
          service,
          ruleType,
          valueNumeric: hit.value_numeric,
          source: step,
          ruleId: hit.id,
          priority: hit.priority,
        });
        break;
      }
    }
  }

  return out.sort(
    (a, b) =>
      a.service.localeCompare(b.service) ||
      a.ruleType.localeCompare(b.ruleType) ||
      a.source.level.localeCompare(b.source.level)
  );
}
