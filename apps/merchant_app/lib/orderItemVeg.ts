/** Resolve veg / non-veg / egg for order line items (Partner Site + menu food_type parity). */

export type ItemVegKind = "veg" | "non_veg" | "egg" | null;

function normalizeFoodToken(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/-/g, "_")
    .replace(/\s+/g, " ");
}

/** Collapse common Indian-menu spelling noise (chappati → chapati). */
function normalizeItemName(name: string): string {
  return normalizeFoodToken(name)
    .replace(/chappatti/g, "chapati")
    .replace(/chappati/g, "chapati")
    .replace(/chapatti/g, "chapati")
    .replace(/bhatur[ae]/g, "bhature")
    .replace(/\broti\b/g, "roti");
}

export function resolveItemVegType(
  vegNonveg?: string | null,
  name?: string | null
): ItemVegKind {
  const t = normalizeFoodToken(vegNonveg ?? "");
  const n = normalizeItemName(name ?? "");
  if (!t && !n) return null;

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
    (t.includes("veg") && !t.includes("non"))
  ) {
    return "veg";
  }

  if (/\b(egg|anda|omelette|omelet)\b/.test(n)) return "egg";
  if (
    /\b(chicken|mutton|fish|prawn|shrimp|meat|keema|seekh|kebab|bacon|ham|non[- ]?veg|biryani|egg curry|butter chicken|fish fry)\b/.test(
      n
    )
  ) {
    return "non_veg";
  }
  // Breads + common veg dishes — include chappati spellings via normalizeItemName.
  if (
    /\b(paneer|dal|daal|veg|sabzi|sabji|aloo|gobi|chapati|paratha|poori|puri|phulka|roti|naan|kulcha|thepla|bhakri|channa|chana|chole|chola|bhature|bhatura|rajma|kadhi|onion|mushroom|corn|cheese|pizza|pasta|noodles|idli|dosa|sambar|samosa|pakora|vada|uttapam|upma|poha|khichdi|thali|curd|raita|lassi|salad|fryums|papad|pickle|plain)\b/.test(
      n
    )
  ) {
    return "veg";
  }
  return null;
}

/**
 * True when every line is veg and none are egg / non-veg.
 * Unknown lines (null) do not qualify — except a sole line whose name has no
 * meat/egg signal is treated as veg after name normalization (e.g. Plain Chappati).
 */
export function isOrderVegOnly(
  lineItems: Array<{ vegNonveg?: string | null; name: string }>,
  orderVegNonVeg?: string | null
): boolean {
  const ov = normalizeFoodToken(orderVegNonVeg ?? "").replace(/\s+/g, "_");
  if (ov === "veg" || ov === "pure_veg" || ov === "pureveg" || ov === "vegetarian") {
    return true;
  }
  if (
    ov === "non_veg" ||
    ov === "nonveg" ||
    ov === "mixed" ||
    ov === "egg" ||
    ov.includes("non_veg")
  ) {
    return false;
  }
  if (lineItems.length === 0) return false;

  const kinds = lineItems.map((it) => resolveItemVegType(it.vegNonveg, it.name));
  if (kinds.some((k) => k === "non_veg" || k === "egg")) return false;
  if (kinds.every((k) => k === "veg")) return true;

  // All remaining are null (or mix of veg+null). Show pill only when nothing
  // looks non-veg/egg and every null name is empty of meat/egg tokens.
  return kinds.every((k, i) => {
    if (k === "veg") return true;
    if (k !== null) return false;
    const n = normalizeItemName(lineItems[i]?.name ?? "");
    if (!n) return false;
    if (/\b(egg|anda|omelette|omelet|chicken|mutton|fish|prawn|shrimp|meat|keema|seekh|kebab|bacon|ham|non[- ]?veg|biryani)\b/.test(n)) {
      return false;
    }
    // Name present and not meat/egg — treat as veg for badge (covers "Plain Chappati").
    return true;
  });
}
