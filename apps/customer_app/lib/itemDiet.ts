/**
 * Canonical FSSAI diet mark: veg (green), egg (amber), non-veg (brown).
 * DB `food_type` is VEG | NON_VEG | EGG | VEGAN (plus legacy labels).
 * Blank / NA is treated as veg (grocery / packaged items).
 */

export type ItemDiet = "veg" | "egg" | "nonveg";

export function resolveItemDiet(input: {
  foodType?: string | null;
  isVeg?: boolean | null;
}): ItemDiet {
  const ft = (input.foodType ?? "")
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ");

  if (ft) {
    if (/(^|\s)egg(\s|$)|eggitarian/.test(ft) && !/\bnon\b/.test(ft)) return "egg";
    if (/\bnon\b/.test(ft) || ft.includes("non veg") || ft.includes("nonveg")) return "nonveg";
    if (ft === "veg" || ft.startsWith("veg") || ft === "vegan" || ft.includes("vegetarian")) {
      return "veg";
    }
    if (ft === "na" || ft === "none" || ft === "n a" || ft === "other") return "veg";
  }

  if (input.isVeg === true) return "veg";
  if (input.isVeg === false && ft) return "nonveg";
  return "veg";
}

export function dietIsVeg(diet: ItemDiet): boolean {
  return diet === "veg";
}
