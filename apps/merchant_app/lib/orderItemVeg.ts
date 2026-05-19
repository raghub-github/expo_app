/** Resolve veg / non-veg for order line items (Partner Site parity). */

export type ItemVegKind = "veg" | "non_veg" | null;

export function resolveItemVegType(
  vegNonveg?: string | null,
  name?: string | null
): ItemVegKind {
  const t = (vegNonveg ?? "").toLowerCase();
  if (t.includes("non") || t === "non_veg" || t === "non-veg") return "non_veg";
  if (t.includes("veg")) return "veg";
  const n = (name ?? "").toLowerCase();
  if (/\b(chicken|mutton|fish|prawn|shrimp|egg|meat|non[- ]?veg|biryani)\b/.test(n)) {
    return "non_veg";
  }
  if (/\b(paneer|dal|veg|sabzi|aloo|gobi|chapati|paratha|poori|channa|chola)\b/.test(n)) {
    return "veg";
  }
  return null;
}

export function isOrderVegOnly(
  lineItems: Array<{ vegNonveg?: string | null; name: string }>,
  orderVegNonVeg?: string | null
): boolean {
  const ov = (orderVegNonVeg ?? "").toLowerCase();
  if (ov === "veg") return true;
  if (ov === "non_veg" || ov === "mixed") return false;
  if (lineItems.length === 0) return false;
  return lineItems.every((it) => resolveItemVegType(it.vegNonveg, it.name) === "veg");
}
