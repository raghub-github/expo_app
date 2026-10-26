/**
 * Amounts an inactive Super Admin fee would have charged.
 * Checkout shows these struck through at ₹0. They are never added to the payable.
 */

export type InactiveFeeRuleInput = {
  type: string;
  serviceType: string;
  calculationType: string;
  valueNumeric: number | null;
  valueJson: unknown;
};

export type InactiveFeeQuotes = {
  delivery?: number;
  platform?: number;
  packaging?: number;
  surge?: number;
  smallOrder?: number;
  convenience?: number;
  fee?: number;
};

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function positive(n: number): number {
  return Number.isFinite(n) && n > 0.005 ? round2(n) : 0;
}

function quoteOne(
  rule: InactiveFeeRuleInput,
  input: {
    routeDeliveryFeeInr: number;
    itemPlusAddon: number;
    itemPackagingTotal: number;
    packagingChargeAmount: number;
    isSelfPickup: boolean;
  }
): number {
  const vn = rule.valueNumeric ?? 0;
  const type = rule.type.trim().toUpperCase();
  if (type === "DELIVERY") {
    if (input.isSelfPickup) return 0;
    return positive(input.routeDeliveryFeeInr);
  }
  if (type === "PACKAGING") {
    if (rule.calculationType === "FORMULA_KEY") {
      const key = (rule.valueJson as { key?: string } | null)?.key ?? "";
      if (key === "MERCHANT_PACKAGING") {
        const fromItems = input.itemPackagingTotal;
        const fallback = input.packagingChargeAmount;
        return positive(fromItems > 0 ? fromItems : fallback);
      }
    }
    if (rule.calculationType === "FIXED") return positive(vn);
    return 0;
  }
  if (type === "PLATFORM_FEE" || type === "SMALL_ORDER_FEE" || type === "CONVENIENCE_FEE") {
    if (rule.calculationType === "FIXED") return positive(vn);
    if (rule.calculationType === "PERCENTAGE") {
      return positive((Math.max(0, input.itemPlusAddon) * vn) / 100);
    }
    return 0;
  }
  if (type === "SURGE" || type === "FEE") {
    if (rule.calculationType === "FIXED") return positive(vn);
    return 0;
  }
  return 0;
}

const KEY_BY_TYPE: Record<string, keyof InactiveFeeQuotes> = {
  DELIVERY: "delivery",
  PLATFORM_FEE: "platform",
  PACKAGING: "packaging",
  SURGE: "surge",
  SMALL_ORDER_FEE: "smallOrder",
  CONVENIENCE_FEE: "convenience",
  FEE: "fee",
};

export function quotesForInactiveFeeRules(args: {
  rules: InactiveFeeRuleInput[];
  activeTypes: ReadonlySet<string>;
  serviceType: string;
  routeDeliveryFeeInr: number;
  itemPlusAddon: number;
  itemPackagingTotal: number;
  packagingChargeAmount: number;
  isSelfPickup: boolean;
}): InactiveFeeQuotes {
  const st = args.serviceType.trim().toUpperCase();
  const byType = new Map<string, InactiveFeeRuleInput[]>();
  for (const rule of args.rules) {
    const type = rule.type.trim().toUpperCase();
    if (args.activeTypes.has(type)) continue;
    const list = byType.get(type) ?? [];
    list.push(rule);
    byType.set(type, list);
  }

  const out: InactiveFeeQuotes = {};
  for (const [type, rules] of byType) {
    const key = KEY_BY_TYPE[type];
    if (!key) continue;
    const specific = rules.filter((r) => r.serviceType.trim().toUpperCase() === st);
    const pool = specific.length > 0 ? specific : rules;
    let sum = 0;
    for (const rule of pool) {
      sum += quoteOne(rule, args);
    }
    const quoted = positive(sum);
    if (quoted > 0) out[key] = quoted;
  }
  return out;
}
