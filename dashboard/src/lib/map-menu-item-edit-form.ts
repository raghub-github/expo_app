import type { ItemFormData } from "@/app/dashboard/merchants/stores/[id]/menu/MenuItemForm";
import {
  normalizeFoodTypeForForm,
  normalizeSpiceLevelForForm,
} from "@/app/dashboard/merchants/stores/[id]/menu/menu-types";
import {
  mapCustomizationsFromApi,
  mapVariantsFromApi,
} from "@/lib/map-menu-item-options";
import { resolveAttachmentProxyUrl } from "@/lib/attachments/resolve-attachment-proxy-url";

export const DEFAULT_ITEM_FORM_DATA: ItemFormData = {
  item_name: "",
  item_description: "",
  item_image_url: "",
  food_type: "",
  spice_level: "",
  cuisine_type: "",
  base_price: "",
  selling_price: "",
  discount_percentage: "0",
  tax_percentage: "0",
  in_stock: true,
  available_quantity: "",
  low_stock_threshold: "",
  has_customizations: false,
  has_addons: false,
  has_variants: false,
  is_popular: false,
  is_recommended: false,
  preparation_time_minutes: 15,
  packaging_enabled: false,
  packaging_charges: "",
  serves: 1,
  serves_label: "",
  item_size_value: "",
  item_size_unit: "",
  available_for_delivery: true,
  weight_per_serving: "",
  weight_per_serving_unit: "grams",
  calories_kcal: "",
  protein: "",
  protein_unit: "mg",
  carbohydrates: "",
  carbohydrates_unit: "mg",
  fat: "",
  fat_unit: "mg",
  fibre: "",
  fibre_unit: "mg",
  item_tags: "",
  is_active: true,
  allergens: "",
  category_id: null,
  customizations: [],
  variants: [],
};

function parseNullableInt(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

/** Prefer item_image_url column; fall back to primary row in merchant_menu_item_images. */
function resolveItemImageUrl(source: Record<string, unknown>): string {
  const candidates: string[] = [];
  const direct = String(source.item_image_url ?? "").trim();
  if (direct) candidates.push(direct);
  const images = source.images;
  if (Array.isArray(images) && images.length > 0) {
    const rows = images as Array<{ is_primary?: boolean; image_url?: unknown }>;
    const primary = rows.find((img) => img.is_primary === true) ?? rows[0];
    const url = String(primary?.image_url ?? "").trim();
    if (url) candidates.push(url);
    for (const row of rows) {
      const u = String(row?.image_url ?? "").trim();
      if (u) candidates.push(u);
    }
  }
  for (const raw of candidates) {
    const resolved = resolveAttachmentProxyUrl(raw);
    if (resolved) return resolved;
  }
  return "";
}

function allergensToFormString(allergens: unknown): string {
  if (Array.isArray(allergens)) return allergens.join(", ");
  if (typeof allergens === "string") return allergens;
  return "";
}

function itemTagsToFormString(tags: unknown): string {
  if (Array.isArray(tags)) return tags.join(", ");
  if (typeof tags === "string") return tags;
  return "";
}

/** Map list row or GET /menu/items/[id] payload into edit form state. */
export function mapMenuItemToEditForm(
  source: Record<string, unknown>,
  menuItemId: number
): ItemFormData {
  const basePriceNum = source.base_price != null ? Number(source.base_price) : null;
  const sellingPriceNum = source.selling_price != null ? Number(source.selling_price) : null;
  const discountNum =
    source.discount_percentage != null ? Number(source.discount_percentage) : 0;
  const taxNum = source.tax_percentage != null ? Number(source.tax_percentage) : 0;
  const pkgRaw = source.packaging_charges;
  const pkgNum = pkgRaw != null && pkgRaw !== "" ? Number(pkgRaw) : NaN;
  const packaging_enabled = Number.isFinite(pkgNum) && pkgNum > 0;

  const customizations = mapCustomizationsFromApi(
    (Array.isArray(source.customizations) ? source.customizations : []) as unknown[],
    menuItemId
  );
  const variants = mapVariantsFromApi(
    (Array.isArray(source.variants) ? source.variants : []) as unknown[],
    menuItemId
  );

  return {
    ...DEFAULT_ITEM_FORM_DATA,
    item_name: String(source.item_name ?? ""),
    item_description: String(source.item_description ?? ""),
    item_image_url: resolveItemImageUrl(source),
    food_type: normalizeFoodTypeForForm(source.food_type as string | undefined),
    spice_level: normalizeSpiceLevelForForm(source.spice_level as string | undefined),
    cuisine_type: String(source.cuisine_type ?? ""),
    base_price: basePriceNum != null ? basePriceNum.toFixed(2) : "",
    selling_price: sellingPriceNum != null ? sellingPriceNum.toFixed(2) : "",
    discount_percentage: String(discountNum),
    tax_percentage: String(taxNum),
    in_stock: source.in_stock !== false,
    has_customizations: customizations.length > 0,
    has_addons: customizations.some((c) => (c.addons?.length ?? 0) > 0),
    has_variants: variants.length > 0,
    is_popular: source.is_popular === true,
    is_recommended: source.is_recommended === true,
    preparation_time_minutes: Number(source.preparation_time_minutes ?? 15),
    packaging_enabled,
    packaging_charges: packaging_enabled ? String(pkgNum) : "",
    serves: Number(source.serves ?? 1),
    serves_label: String(source.serves_label ?? ""),
    item_size_value:
      source.item_size_value != null ? String(source.item_size_value) : "",
    item_size_unit: String(source.item_size_unit ?? ""),
    available_for_delivery: source.available_for_delivery !== false,
    weight_per_serving:
      source.weight_per_serving != null ? String(source.weight_per_serving) : "",
    weight_per_serving_unit: String(source.weight_per_serving_unit ?? "grams"),
    calories_kcal:
      source.calories_kcal != null ? String(source.calories_kcal) : "",
    protein: source.protein != null ? String(source.protein) : "",
    protein_unit: String(source.protein_unit ?? "mg"),
    carbohydrates:
      source.carbohydrates != null ? String(source.carbohydrates) : "",
    carbohydrates_unit: String(source.carbohydrates_unit ?? "mg"),
    fat: source.fat != null ? String(source.fat) : "",
    fat_unit: String(source.fat_unit ?? "mg"),
    fibre: source.fibre != null ? String(source.fibre) : "",
    fibre_unit: String(source.fibre_unit ?? "mg"),
    item_tags: itemTagsToFormString(source.item_tags),
    is_active: source.is_active !== false,
    allergens: allergensToFormString(source.allergens),
    category_id: parseNullableInt(source.category_id),
    customizations,
    variants,
  };
}
