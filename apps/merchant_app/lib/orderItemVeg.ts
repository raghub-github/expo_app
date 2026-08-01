/** Resolve veg / non-veg / egg for order line items (Partner Site + menu food_type parity). */

export type ItemVegKind = "veg" | "non_veg" | "egg" | null;

export function resolveItemVegType(
  vegNonveg?: string | null,
  name?: string | null
): ItemVegKind {
  const t = (vegNonveg ?? "").trim().toLowerCase().replace(/-/g, "_");
  if (!t && !(name ?? "").trim()) return null;

  // Menu food_type values: VEG | NON_VEG | EGG (and loose variants).
  if (t === "egg" || t === "eggetarian" || t.includes("egg")) return "egg";
  if (
    t === "non_veg" ||
    t === "nonveg" ||
    t.startsWith("non_") ||
    t.includes("non_veg") ||
    t.includes("nonveg")
  ) {
    return "non_veg";
  }
  if (t === "veg" || t === "vegetarian" || t.includes("veg")) return "veg";

  const n = (name ?? "").toLowerCase();
  if (/\b(egg|anda|omelette|omelet)\b/.test(n)) return "egg";
  if (
    /\b(chicken|mutton|fish|prawn|shrimp|meat|keema|seekh|kebab|bacon|ham|non[- ]?veg|biryani)\b/.test(
      n
    )
  ) {
    return "non_veg";
  }
  if (
    /\b(paneer|dal|veg|sabzi|aloo|gobi|chapati|paratha|poori|channa|chola|onion|mushroom|corn|cheese|pizza|pasta|noodles|idli|dosa|sambar)\b/.test(
      n
    )
  ) {
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
  if (ov === "non_veg" || ov === "mixed" || ov === "egg") return false;
  if (lineItems.length === 0) return false;
  return lineItems.every((it) => resolveItemVegType(it.vegNonveg, it.name) === "veg");
}
