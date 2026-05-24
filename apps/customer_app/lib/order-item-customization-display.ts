/** Parse order detail line item customizations for customer UI. */

export type OrderDetailLineItem = {
  name: string;
  quantity: number;
  variantName?: string | null;
  customization?: string | null;
};

export function orderItemHasCustomizations(item: OrderDetailLineItem): boolean {
  return Boolean(item.customization?.trim() || item.variantName?.trim());
}

/** Variant + add-ons (deduped, order preserved). */
export function orderItemCustomizationLines(item: OrderDetailLineItem): string[] {
  const variant = item.variantName?.trim() ?? "";
  const raw = item.customization?.trim() ?? "";
  const seen = new Set<string>();
  const lines: string[] = [];

  const add = (s: string) => {
    const t = s.trim();
    if (!t) return;
    const key = t.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    lines.push(t);
  };

  const variantKey = variant.toLowerCase();
  if (variant) add(variant);
  if (raw) {
    for (const part of raw.split(/\s*·\s*/)) {
      const t = part.trim();
      if (!t) continue;
      if (variantKey && t.toLowerCase() === variantKey) continue;
      add(t);
    }
  }
  return lines;
}
