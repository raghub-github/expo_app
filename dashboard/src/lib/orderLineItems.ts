import { merchantFundedDiscountFromBilling } from '@/lib/merchant-billing-discount';

/** Shared order line-item parsing for partner food order APIs and UI. */

export type OrderItemCustomizationLine = {
  name: string;
  amount: number;
  kind: "variant" | "addon" | "note";
};

export type NormalizedOrderLineItem = {
  name: string;
  quantity: number;
  price: number;
  total: number;
  customizations?: string[];
  vegNonveg?: string | null;
  menuItemId?: number | null;
  variantName?: string | null;
  variantTag?: string | null;
  categoryName?: string | null;
  description?: string | null;
  imageUrl?: string | null;
  customizationLines?: OrderItemCustomizationLine[];
  baseAmount?: number;
  customizationsTotal?: number;
  /** orders_core_items.base_price × qty at order placement */
  capturedBaseAmount?: number;
  /** orders_core_items.addon_price at order placement */
  capturedAddonAmount?: number;
  hasCustomizations?: boolean;
};

export type OrderPricingBreakdown = {
  subtotal: number;
  packaging: number;
  taxes: number;
  discount: number;
  total: number;
};

export function extractItemsArray(rawItems: unknown): unknown[] {
  if (Array.isArray(rawItems)) return rawItems;
  if (typeof rawItems === 'string') {
    try {
      const parsed = JSON.parse(rawItems) as unknown;
      if (Array.isArray(parsed)) return parsed;
      if (parsed && typeof parsed === 'object') {
        const o = parsed as Record<string, unknown>;
        if (Array.isArray(o.items)) return o.items;
        if (Array.isArray(o.order_items)) return o.order_items;
        if (Array.isArray(o.cart_items)) return o.cart_items;
      }
    } catch {
      return [];
    }
  }
  if (rawItems && typeof rawItems === 'object') {
    const o = rawItems as Record<string, unknown>;
    if (Array.isArray(o.items)) return o.items;
    if (Array.isArray(o.order_items)) return o.order_items;
    if (Array.isArray(o.cart_items)) return o.cart_items;
  }
  return [];
}

function itemSnapshot(row: Record<string, unknown>): Record<string, unknown> | null {
  const snap = row.item_snapshot ?? row.itemSnapshot;
  return snap && typeof snap === 'object' ? (snap as Record<string, unknown>) : null;
}

/** True when JSON items lack real names (placeholders like "Item 1") — prefer orders_core_items. */
export function orderRawItemsMissingDisplayNames(rawItems: unknown): boolean {
  const arr = extractItemsArray(rawItems);
  if (arr.length === 0) return true;
  return arr.every((it, idx) => {
    const row = (it && typeof it === 'object' ? it : {}) as Record<string, unknown>;
    const snap = itemSnapshot(row);
    const n = String(
      row.name ??
        row.item_name ??
        row.title ??
        row.product_name ??
        snap?.name ??
        snap?.item_name ??
        snap?.title ??
        ''
    ).trim();
    if (!n) return true;
    return /^item(\s*\d+)?$/i.test(n) || n === `Item ${idx + 1}`;
  });
}

export function normalizeOrderItems(rawItems: unknown): NormalizedOrderLineItem[] {
  const arr = extractItemsArray(rawItems);
  if (!Array.isArray(arr) || arr.length === 0) return [];
  return arr.map((it, idx) => {
    const row = (it && typeof it === 'object' ? it : {}) as Record<string, unknown>;
    const qty = Number(row.quantity) || 1;
    const unitPrice = Number(row.price ?? row.unit_price ?? row.base_price ?? 0);
    const total = Number(row.total ?? row.total_price ?? unitPrice * qty);
    const snap = itemSnapshot(row);
    const baseName = String(
      row.name ??
        row.item_name ??
        row.title ??
        row.product_name ??
        snap?.name ??
        snap?.item_name ??
        snap?.title ??
        `Item ${idx + 1}`
    ).trim();
    const variant = String(
      row.variant_tag ?? row.variant_name ?? row.variantName ?? snap?.variant_name ?? ''
    ).trim();
    const name =
      String(row.display_name ?? '').trim() ||
      (variant && !String(row.variant_tag ?? '').trim()
        ? `${baseName} (${variant})`
        : baseName);
    const menuItemIdRaw = row.menu_item_id ?? row.menuItemId ?? snap?.menu_item_id;
    const menuItemId =
      menuItemIdRaw != null && menuItemIdRaw !== '' ? Number(menuItemIdRaw) : null;
    let customizations: string[] | undefined;
    if (Array.isArray(row.customizations)) {
      customizations = (row.customizations as unknown[]).map((c) => String(c)).filter(Boolean);
    } else if (Array.isArray(row.addons)) {
      customizations = (row.addons as Record<string, unknown>[]).map((a) => {
        const n = String(a.addon_name ?? a.name ?? 'Add-on').trim();
        const q = Number(a.quantity) || 1;
        return q > 1 ? `${n} ×${q}` : n;
      });
    }
    const vegNonveg =
      (row.veg_nonveg as string | undefined) ??
      (row.vegNonveg as string | undefined) ??
      (row.item_type as string | undefined) ??
      null;
    const categoryName =
      String(row.category_name ?? row.categoryName ?? snap?.category_name ?? '').trim() || null;
    const description =
      String(row.item_description ?? row.description ?? snap?.item_description ?? '').trim() || null;
    const imageUrl =
      String(row.item_image_url ?? row.imageUrl ?? snap?.item_image_url ?? '').trim() || null;

    const customizationLines = Array.isArray(row.customization_lines)
      ? (row.customization_lines as OrderItemCustomizationLine[])
      : Array.isArray(row.customizationLines)
        ? (row.customizationLines as OrderItemCustomizationLine[])
        : undefined;
    const variantTag =
      String(row.variant_tag ?? variant ?? '').trim() || null;
    const baseAmount =
      row.base_amount != null ? Number(row.base_amount) : undefined;
    const customizationsTotal =
      row.customizations_total != null ? Number(row.customizations_total) : undefined;
    const capturedBaseAmount =
      row.captured_base_amount != null ? Number(row.captured_base_amount) : undefined;
    const capturedAddonAmount =
      row.captured_addon_amount != null ? Number(row.captured_addon_amount) : undefined;

    return {
      name,
      quantity: qty,
      price: unitPrice,
      total,
      customizations: customizations?.length ? customizations : undefined,
      vegNonveg,
      menuItemId: Number.isFinite(menuItemId as number) ? (menuItemId as number) : null,
      variantName: variant || null,
      variantTag,
      categoryName:
        String(row.category_name ?? row.categoryName ?? categoryName ?? '').trim() ||
        categoryName,
      description,
      imageUrl,
      customizationLines: customizationLines?.length ? customizationLines : undefined,
      baseAmount: Number.isFinite(baseAmount as number) ? baseAmount : undefined,
      customizationsTotal: Number.isFinite(customizationsTotal as number)
        ? customizationsTotal
        : undefined,
      capturedBaseAmount: Number.isFinite(capturedBaseAmount as number)
        ? capturedBaseAmount
        : undefined,
      capturedAddonAmount: Number.isFinite(capturedAddonAmount as number)
        ? capturedAddonAmount
        : undefined,
      hasCustomizations:
        Boolean(row.has_customizations) ||
        Boolean(row.hasCustomizations) ||
        (customizationLines?.length ?? 0) > 0 ||
        (customizations?.length ?? 0) > 0,
    };
  });
}

type CoreItemRow = {
  id: number;
  order_id: string;
  menu_item_id?: number | null;
  item_name: string;
  variant_name?: string | null;
  category_name?: string | null;
  quantity: number;
  base_price: string | number;
  addon_price?: string | number | null;
  total_price: string | number;
  veg_nonveg?: string | null;
  item_snapshot?: Record<string, unknown> | null;
};

function imageUrlFromSnapshot(snap: Record<string, unknown> | null | undefined): string | null {
  if (!snap || typeof snap !== "object") return null;
  const url = String(
    snap.item_image_url ?? snap.imageUrl ?? snap.itemImageUrl ?? snap.image_url ?? ""
  ).trim();
  return url || null;
}

type CoreAddonRow = {
  order_item_id: number;
  addon_name?: string | null;
  quantity: number;
  addon_price?: string | number | null;
};

/** Build raw item objects from orders_core_items (+ addons) for normalizeOrderItems. */
export function mapCoreDbItemsToRaw(
  items: CoreItemRow[],
  addonsByItemId: Map<number, CoreAddonRow[]>
): Record<string, unknown>[] {
  return items.map((row) => {
    const addons = addonsByItemId.get(row.id) ?? [];
    const customizations = addons
      .map((a) => {
        const n = String(a.addon_name ?? 'Add-on').trim();
        const q = Number(a.quantity) || 1;
        return q > 1 ? `${n} ×${q}` : n;
      })
      .filter(Boolean);
    const qty = Number(row.quantity) || 1;
    const unit = Number(row.base_price) || 0;
    const variant = String(row.variant_name ?? '').trim();
    const baseName = String(row.item_name ?? 'Item').trim();
    const snap = row.item_snapshot ?? null;
    const imageUrl = imageUrlFromSnapshot(snap);
    const addonUnit = Number(row.addon_price) || 0;
    return {
      name: variant ? `${baseName} (${variant})` : baseName,
      item_name: row.item_name,
      menu_item_id: row.menu_item_id ?? null,
      variant_name: variant || null,
      category_name: row.category_name ?? null,
      item_snapshot: snap,
      quantity: qty,
      price: unit,
      unit_price: unit,
      addon_price: addonUnit,
      total: Number(row.total_price) || unit * qty,
      total_price: Number(row.total_price) || unit * qty,
      veg_nonveg: row.veg_nonveg ?? null,
      customizations: customizations.length ? customizations : undefined,
      item_image_url: imageUrl,
      imageUrl,
    };
  });
}

export function parseMerchantBillingBreakdown(
  core: Record<string, unknown>,
  foodTotal: number | string | null | undefined
): OrderPricingBreakdown {
  const snap =
    core.billing_snapshot && typeof core.billing_snapshot === 'object'
      ? (core.billing_snapshot as Record<string, unknown>)
      : null;

  const itemTotal = Number(snap?.item_total ?? core.item_total ?? 0) || 0;
  const addonTotal = Number(snap?.addon_total ?? core.addon_total ?? 0) || 0;
  const subtotal = itemTotal + addonTotal;
  const packaging = Number(snap?.packaging_fee ?? 0) || 0;
  const taxes = Number(snap?.tax_total ?? 0) || 0;
  const discount = merchantFundedDiscountFromBilling(snap);
  const foodNum = foodTotal != null && foodTotal !== '' ? Number(foodTotal) : NaN;
  const total =
    Number.isFinite(foodNum) && foodNum > 0
      ? foodNum
      : Math.max(0, subtotal + packaging + taxes - discount);

  return { subtotal, packaging, taxes, discount, total };
}
