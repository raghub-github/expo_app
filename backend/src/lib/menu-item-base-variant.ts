/** Synthetic variant id for the parent menu item's own size/price row. */
export const BASE_MENU_ITEM_VARIANT_ID = "0";

function normalizeSizeKey(
  value: string | null | undefined,
  unit: string | null | undefined
): string {
  const v = value != null ? String(value).trim() : "";
  const u = unit != null ? String(unit).trim().toLowerCase() : "";
  if (!v && !u) return "";
  return `${v}:${u}`;
}

function pricesMatch(a: number, b: number): boolean {
  return Math.abs(a - b) < 0.01;
}

export function variantRepresentsBaseItem(
  variant: {
    name: string;
    sizeValue?: string | null;
    sizeUnit?: string | null;
    price: number;
  },
  base: {
    name: string;
    sizeValue?: string | null;
    sizeUnit?: string | null;
    price: number;
  }
): boolean {
  const sizeA = normalizeSizeKey(variant.sizeValue, variant.sizeUnit);
  const sizeB = normalizeSizeKey(base.sizeValue, base.sizeUnit);
  if (sizeA && sizeB && sizeA === sizeB && pricesMatch(variant.price, base.price)) {
    return true;
  }
  const nameA = variant.name.trim().toLowerCase();
  const nameB = base.name.trim().toLowerCase();
  return Boolean(nameA && nameB && nameA === nameB && pricesMatch(variant.price, base.price));
}

export type MenuItemVariantOption = {
  id: string;
  name: string;
  type?: string | null;
  sizeValue?: string | null;
  sizeUnit?: string | null;
  price: number;
  isDefault: boolean;
  displayOrder: number;
};

/** When variants exist, expose the parent item's configured size/price as the first choice. */
export function prependBaseMenuItemVariant(
  item: {
    name: string;
    price: number;
    sizeValue?: string | null;
    sizeUnit?: string | null;
    shortName?: string | null;
  },
  variants: MenuItemVariantOption[]
): MenuItemVariantOption[] {
  if (variants.length === 0) return variants;

  const baseName = (item.shortName?.trim() || item.name?.trim() || "Regular").trim();
  const base = {
    name: baseName,
    sizeValue: item.sizeValue ?? null,
    sizeUnit: item.sizeUnit ?? null,
    price: item.price,
  };

  if (variants.some((v) => variantRepresentsBaseItem(v, base))) {
    return variants;
  }

  const anyDefault = variants.some((v) => v.isDefault);
  const minOrder = variants.reduce((m, v) => Math.min(m, v.displayOrder), 0);

  const baseVariant: MenuItemVariantOption = {
    id: BASE_MENU_ITEM_VARIANT_ID,
    name: baseName,
    type: null,
    sizeValue: base.sizeValue,
    sizeUnit: base.sizeUnit,
    price: item.price,
    isDefault: !anyDefault,
    displayOrder: minOrder - 1,
  };

  return [baseVariant, ...variants].sort(
    (a, b) =>
      a.displayOrder - b.displayOrder ||
      (a.isDefault ? -1 : 0) - (b.isDefault ? -1 : 0)
  );
}

export function isBaseMenuItemVariantId(variantId: string | null | undefined): boolean {
  const id = String(variantId ?? "").trim();
  return id === BASE_MENU_ITEM_VARIANT_ID;
}
