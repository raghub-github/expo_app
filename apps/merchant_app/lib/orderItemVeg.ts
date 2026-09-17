/** Resolve veg / non-veg / egg for order line items (Partner Site + menu food_type parity). */

export type ItemVegKind = "veg" | "non_veg" | "egg" | null;

export function resolveItemVegType(
  vegNonveg?: string | null,
  name?: string | null
): ItemVegKind {
  const t = (vegNonveg ?? "").trim().toLowerCase().replace(/-/g, "_");
  if (!t && !(name ?? "").trim()) return null;

  // Menu food_type values: VEG | NON_VEG | EGG (and loose variants).
  if (
    t === "egg" ||
    t === "eggetarian" ||
    t === "contains_egg" ||
    t === "egg_only" ||
    (t.includes("egg") && !t.includes("veg"))
  ) {
    return "egg";
  }
  if (
    t === "non_veg" ||
    t === "nonveg" ||
    t === "non vegetarian" ||
    t === "nonvegetarian" ||
    t === "nv" ||
    t.startsWith("non_") ||
    t.includes("non_veg") ||
    t.includes("nonveg") ||
    t.includes("non veg")
  ) {
    return "non_veg";
  }
  if (
    t === "veg" ||
    t === "v" ||
    t === "vegetarian" ||
    t === "pure_veg" ||
    t === "pureveg" ||
    t.includes("veg")
  ) {
    return "veg";
  }

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
    /\b(paneer|dal|veg|sabzi|aloo|gobi|chapati|paratha|poori|puri|channa|chana|chole|chola|bhature|bhatura|rajma|kadhi|onion|mushroom|corn|cheese|pizza|pasta|noodles|idli|dosa|sambar|samosa|pakora|vada|uttapam|upma|poha|khichdi|thali)\b/.test(
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
