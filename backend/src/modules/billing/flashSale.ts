/**
 * FLASH_SALE config + runtime overlay math.
 * Catalogue selling_price / base_price / Fare Engine slabs are never written here.
 */

import { menuIdAliases } from "./discountEligibility.js";
import type { PlatformOfferRow } from "./types.js";

export const FLASH_SALE_KIND = "FLASH_SALE";
export const FLASH_SALE_UNAVAILABLE = "FLASH_SALE_UNAVAILABLE";
export const FLASH_SALE_PRICE_STALE = "FLASH_SALE_PRICE_STALE";
export const FLASH_SALE_ALREADY_USED = "FLASH_SALE_ALREADY_USED";
export const FLASH_SALE_ALREADY_RESERVED = "FLASH_SALE_ALREADY_RESERVED";
export const FLASH_SALE_QTY_EXCEEDED = "FLASH_SALE_QTY_EXCEEDED";

export type FlashSaleItemConfig = {
  menuItemId: string;
  flashPrice: number;
  /** Optional store PK for multi-outlet admin round-trip (runtime overlay keys on menuItemId). */
  storeId?: number | null;
};

export type FlashSaleOverlayLine = {
  menuItemId: string;
  quantity: number;
  originalUnit: number;
  flashUnit: number;
  subsidyLine: number;
  offerId: number;
};

export type FlashSaleOverlaySummary = {
  offerIds: number[];
  subsidyTotal: number;
  lines: FlashSaleOverlayLine[];
};

function round2(n: number): number {
  return Math.round((Number.isFinite(n) ? n : 0) * 100) / 100;
}

function num(v: unknown): number {
  if (v == null) return NaN;
  const x = typeof v === "number" ? v : parseFloat(String(v));
  return Number.isFinite(x) ? x : NaN;
}

export function isFlashSaleKind(kind: unknown): boolean {
  return String(kind ?? "").toUpperCase() === FLASH_SALE_KIND;
}

export function isFoodFlashSale(o: { offerKind?: unknown; serviceType?: unknown }): boolean {
  if (!isFlashSaleKind(o.offerKind)) return false;
  const st = String(o.serviceType ?? "FOOD").toUpperCase();
  return st === "FOOD" || st === "ALL";
}

export function isRideFlashSale(o: { offerKind?: unknown; serviceType?: unknown }): boolean {
  if (!isFlashSaleKind(o.offerKind)) return false;
  const st = String(o.serviceType ?? "").toUpperCase();
  return st === "RIDE" || st === "PARCEL";
}

export function parseFlashSaleItems(conditions: unknown): FlashSaleItemConfig[] {
  if (!conditions || typeof conditions !== "object" || Array.isArray(conditions)) return [];
  const c = conditions as Record<string, unknown>;
  const raw = c.flash_sale_items ?? c.flashSaleItems;
  const out: FlashSaleItemConfig[] = [];
  const seen = new Set<string>();

  if (Array.isArray(raw)) {
    for (const row of raw) {
      if (!row || typeof row !== "object") continue;
      const r = row as Record<string, unknown>;
      const id = String(r.menu_item_id ?? r.menuItemId ?? r.item_id ?? r.itemId ?? "").trim();
      const price = num(r.flash_price ?? r.flashPrice ?? r.price);
      if (!id || !Number.isFinite(price) || price < 0) continue;
      if (seen.has(id)) continue;
      seen.add(id);
      const storeRaw = r.store_id ?? r.storeId;
      const storeId = storeRaw != null ? Number(storeRaw) : NaN;
      out.push({
        menuItemId: id,
        flashPrice: round2(price),
        storeId: Number.isInteger(storeId) && storeId > 0 ? storeId : null,
      });
    }
  }

  if (out.length > 0) return out;

  const idsRaw = c.menu_item_ids ?? c.menuItemIds;
  const shared = num(c.flash_price ?? c.flashPrice);
  if (Array.isArray(idsRaw) && Number.isFinite(shared) && shared >= 0) {
    for (const idRaw of idsRaw) {
      const id = String(idRaw ?? "").trim();
      if (!id || seen.has(id)) continue;
      seen.add(id);
      out.push({ menuItemId: id, flashPrice: round2(shared) });
    }
  }
  return out;
}

/** Percent off vs original customer unit (e.g. 99→9 → 91). */
export function computeFlashSaleOffPercent(
  originalCustomerUnit: number,
  flashPrice: number
): number | null {
  const orig = round2(originalCustomerUnit);
  const flash = round2(flashPrice);
  if (!(orig > 0) || !(flash >= 0) || flash >= orig - 0.0001) return null;
  return Math.max(1, Math.round(((orig - flash) / orig) * 100));
}

export function flashSaleItemIdSet(items: FlashSaleItemConfig[]): Set<string> {
  const out = new Set<string>();
  for (const it of items) {
    for (const a of menuIdAliases(it.menuItemId)) out.add(a);
    out.add(it.menuItemId);
  }
  return out;
}

export function flashPriceForMenuItem(
  items: FlashSaleItemConfig[],
  menuItemId: unknown,
  extraAliases?: string[]
): number | null {
  if (items.length === 0) return null;
  const aliases = new Set(menuIdAliases(menuItemId));
  for (const extra of extraAliases ?? []) {
    for (const a of menuIdAliases(extra)) aliases.add(a);
  }
  if (aliases.size === 0) return null;
  for (const it of items) {
    const targets = new Set(menuIdAliases(it.menuItemId));
    targets.add(it.menuItemId);
    for (const a of aliases) {
      if (targets.has(a)) return it.flashPrice;
    }
  }
  return null;
}

export function computeFlashSaleSubsidy(
  originalCustomerUnit: number,
  flashPrice: number,
  quantity: number
): number {
  const orig = round2(originalCustomerUnit);
  const flash = round2(flashPrice);
  const qty = Math.max(1, Math.floor(Number(quantity) || 1));
  if (!(orig > 0) || !(flash >= 0) || flash >= orig - 0.0001) return 0;
  return round2((orig - flash) * qty);
}

export function overlayFlashCustomerUnit(
  originalCustomerUnit: number,
  flashPrice: number
): { unit: number; subsidyUnit: number } | null {
  const orig = round2(originalCustomerUnit);
  const flash = round2(flashPrice);
  if (!(orig > 0) || !(flash >= 0) || flash >= orig - 0.0001) return null;
  return { unit: flash, subsidyUnit: round2(orig - flash) };
}

export function validateFlashSalePrice(
  flashPrice: unknown,
  originalCustomerUnit?: number | null
): string | null {
  const price = num(flashPrice);
  if (!Number.isFinite(price)) return "Flash Sale price must be a valid number.";
  if (price < 0) return "Flash Sale price cannot be negative.";
  if (originalCustomerUnit != null && Number.isFinite(originalCustomerUnit)) {
    if (price >= round2(originalCustomerUnit) - 0.0001) {
      return "Flash Sale price must be lower than the original customer price.";
    }
  }
  return null;
}

/** Integer ≥ 1 from stored offer config. Missing/invalid → NaN (do not invent a cap). */
export function parseMaxFlashQuantity(raw: unknown): number {
  if (raw == null || raw === "") return NaN;
  if (typeof raw === "boolean") return NaN;
  if (typeof raw === "number") {
    if (!Number.isInteger(raw) || raw < 1) return NaN;
    return raw;
  }
  const t = String(raw).trim();
  if (!t || !/^\d+$/.test(t)) return NaN;
  const n = Number(t);
  if (!Number.isInteger(n) || n < 1) return NaN;
  return n;
}

export function validateMaxFlashQuantity(raw: unknown): string | null {
  if (raw == null || raw === "") return null;
  const n = parseMaxFlashQuantity(raw);
  if (!Number.isInteger(n) || n < 1) {
    return "Max Flash Quantity must be a whole number of at least 1.";
  }
  return null;
}

/**
 * Read max_flash_quantity from the stored offer `conditions` JSON.
 * Unmigrated Flash Sale rows (field absent) fall back to 1 only to prevent unlimited qty.
 * After migration / admin save, the database value is always used.
 */
export function resolveMaxFlashQuantity(conditions: unknown): number {
  if (!conditions || typeof conditions !== "object" || Array.isArray(conditions)) {
    return 1;
  }
  const c = conditions as Record<string, unknown>;
  const n = parseMaxFlashQuantity(c.max_flash_quantity ?? c.maxFlashQuantity);
  return Number.isInteger(n) && n >= 1 ? n : 1;
}

export function flashSaleQtyExceededMessage(maxFlashQuantity: number): string {
  const n = Math.floor(Number(maxFlashQuantity));
  if (!Number.isInteger(n) || n < 1) {
    return "This Flash Sale quantity limit was exceeded.";
  }
  return n === 1
    ? `Maximum ${n} quantity allowed for this Flash Sale item.`
    : `Maximum ${n} quantities allowed for this Flash Sale item.`;
}

export function validateFoodFlashSaleConfig(args: {
  merchantIds: unknown;
  conditions: unknown;
}): string | null {
  const ids = Array.isArray(args.merchantIds)
    ? [...new Set(args.merchantIds.map((x) => Number(x)).filter((n) => Number.isInteger(n) && n > 0))]
    : [];
  if (ids.length < 1) return "Flash Sale requires at least one store.";
  const items = parseFlashSaleItems(args.conditions);
  if (items.length === 0) return "Select at least one item and set a Flash Sale price.";
  for (const it of items) {
    const err = validateFlashSalePrice(it.flashPrice);
    if (err) return err;
  }
  if (args.conditions && typeof args.conditions === "object" && !Array.isArray(args.conditions)) {
    const c = args.conditions as Record<string, unknown>;
    if (c.max_flash_quantity != null || c.maxFlashQuantity != null) {
      const qtyErr = validateMaxFlashQuantity(c.max_flash_quantity ?? c.maxFlashQuantity);
      if (qtyErr) return qtyErr;
    }
  }
  return null;
}

export function flashSaleItemsFromOffer(o: PlatformOfferRow): FlashSaleItemConfig[] {
  return parseFlashSaleItems(o.conditions);
}

export function applyFlashSaleSaveDefaults<T extends Record<string, unknown>>(input: T): T {
  const kind = String(input.offer_kind ?? input.offerKind ?? "").toUpperCase();
  if (kind !== FLASH_SALE_KIND) return input;
  const service = String(input.service_type ?? input.serviceType ?? "FOOD").toUpperCase();
  const next: Record<string, unknown> = {
    ...input,
    offer_kind: FLASH_SALE_KIND,
    funding_mode: "PLATFORM_ONLY",
    platform_share_pct: 100,
    merchant_share_pct: 0,
    max_uses_per_user: 1,
    is_stackable: false,
    offer_audience: "CUSTOMER",
  };
  if (service === "FOOD" || service === "ALL") {
    next.target_scope = "MERCHANT";
    next.discount_type = "FIXED";
    next.value_numeric = null;
    next.delivery_discount_type = null;
    next.delivery_discount_value = null;
    const promo =
      input.promo_config && typeof input.promo_config === "object" && !Array.isArray(input.promo_config)
        ? { ...(input.promo_config as Record<string, unknown>) }
        : {};
    promo.auto_apply = true;
    next.promo_config = promo;
  }
  if (service === "RIDE" || service === "PARCEL") {
    const promo =
      input.promo_config && typeof input.promo_config === "object" && !Array.isArray(input.promo_config)
        ? { ...(input.promo_config as Record<string, unknown>) }
        : {};
    promo.promo_type = "PAY_FIXED";
    promo.auto_apply = promo.auto_apply !== false;
    next.promo_config = promo;
  }
  return next as T;
}

export function emptyFlashSaleOverlay(): FlashSaleOverlaySummary {
  return { offerIds: [], subsidyTotal: 0, lines: [] };
}

export function mergeFlashSaleSnapshot(
  canonical: Record<string, unknown>,
  overlay: {
    offerId: number;
    originalCustomerUnit: number;
    flashUnit: number;
    /** Flash-priced units only (≤ max_flash_quantity). */
    quantity: number;
    subsidyLine: number;
    maxFlashQuantity?: number;
    /** Full ordered qty on the cart line (flash + regular). Defaults to `quantity`. */
    orderedQuantity?: number;
  }
): Record<string, unknown> {
  const flashQty = Math.max(1, Math.floor(overlay.quantity) || 1);
  const orderedQty = Math.max(
    flashQty,
    Math.floor(Number(overlay.orderedQuantity ?? overlay.quantity) || flashQty)
  );
  const regularQty = Math.max(0, orderedQty - flashQty);
  const oldUnit = num(canonical.customer_item_price_unit);
  const oldLine = num(canonical.customer_item_price_line);
  // Prefer prior ordered qty for addon residual when the menu overlay used qty=1.
  const oldQtyHint = Math.max(
    1,
    Math.floor(Number(canonical.ordered_quantity ?? orderedQty) || orderedQty)
  );
  const addonCustomer =
    Number.isFinite(oldUnit) && Number.isFinite(oldLine)
      ? Math.max(0, round2(oldLine - oldUnit * oldQtyHint))
      : 0;
  const flashTotal = round2(overlay.flashUnit * flashQty);
  const regularTotal = round2(overlay.originalCustomerUnit * regularQty);
  const lineTotal = round2(flashTotal + regularTotal + addonCustomer);
  const blendedUnit =
    orderedQty > 0 ? round2((flashTotal + regularTotal) / orderedQty) : overlay.flashUnit;
  return {
    ...canonical,
    customer_strike_unit: overlay.originalCustomerUnit,
    customer_strike_line: round2(overlay.originalCustomerUnit * orderedQty + addonCustomer),
    customer_item_price_unit: blendedUnit,
    customer_item_price_line: lineTotal,
    flash_sale: {
      offer_id: overlay.offerId,
      original_customer_unit: overlay.originalCustomerUnit,
      flash_price: overlay.flashUnit,
      subsidy_unit: round2(overlay.originalCustomerUnit - overlay.flashUnit),
      subsidy_line: overlay.subsidyLine,
      max_flash_quantity: overlay.maxFlashQuantity,
      ordered_quantity: orderedQty,
      flash_sale_quantity: flashQty,
      regular_quantity: regularQty,
      flash_sale_total: flashTotal,
      regular_total: regularTotal,
      line_total: lineTotal,
    },
  };
}

function readClientFlashSaleBlob(snapshot: unknown): Record<string, unknown> | null {
  if (!snapshot || typeof snapshot !== "object") return null;
  const s = snapshot as Record<string, unknown>;
  const direct = s.flash_sale ?? s.flashSale;
  const nested =
    s.canonical_pricing && typeof s.canonical_pricing === "object"
      ? (s.canonical_pricing as Record<string, unknown>).flash_sale
      : null;
  const raw = direct && typeof direct === "object" ? direct : nested;
  return raw && typeof raw === "object" ? (raw as Record<string, unknown>) : null;
}

export function readClientFlashSaleOfferId(snapshot: unknown): number | null {
  const raw = readClientFlashSaleBlob(snapshot);
  if (!raw) return null;
  const id = Number(raw.offer_id ?? raw.offerId);
  return Number.isInteger(id) && id > 0 ? id : null;
}

export function readClientFlashSalePrice(snapshot: unknown): number | null {
  const raw = readClientFlashSaleBlob(snapshot);
  if (!raw) return null;
  const price = num(raw.flash_price ?? raw.flashPrice ?? raw.flash_unit);
  return Number.isFinite(price) && price >= 0 ? round2(price) : null;
}

/** Remaining campaign budget after subsidy consumption. Null = unlimited. */
export function flashSaleBudgetRemaining(
  budgetTotal: number | string | null | undefined,
  budgetUsed: number | string | null | undefined
): number | null {
  const total = num(budgetTotal);
  if (!Number.isFinite(total) || total <= 0) return null;
  const used = num(budgetUsed);
  return round2(Math.max(0, total - (Number.isFinite(used) ? used : 0)));
}

/** Remaining lifetime redemptions. Null = unlimited. */
export function flashSaleRemainingRedemptions(
  maxUsesTotal: number | string | null | undefined,
  activeRedemptions: number | string | null | undefined
): number | null {
  const cap = Number(maxUsesTotal);
  if (!Number.isFinite(cap) || cap <= 0) return null;
  const used = Number(activeRedemptions);
  return Math.max(0, Math.floor(cap) - Math.max(0, Number.isFinite(used) ? Math.floor(used) : 0));
}

/** Menu overlay is display-only; skip OOS / locked / disabled catalogue rows. */
export function menuRowEligibleForFlashOverlay(row: {
  in_stock?: boolean | null;
  is_active?: boolean | null;
  is_locked_by_plan?: boolean | null;
  effective_in_stock?: boolean | null;
}): boolean {
  if (row.is_locked_by_plan === true) return false;
  if (row.is_active === false) return false;
  if (row.in_stock === false) return false;
  if (row.effective_in_stock === false) return false;
  return true;
}

/** Reopen the unique (customer, offer) slot only when the offer restore flags allow it. */
export function shouldRestoreFlashSaleRedemption(args: {
  nextStatus: "cancelled" | "refunded";
  restoreOnCancel: boolean | null | undefined;
  restoreOnRefund: boolean | null | undefined;
}): boolean {
  return args.nextStatus === "cancelled"
    ? args.restoreOnCancel !== false
    : args.restoreOnRefund !== false;
}

/** Unique-index conflicts: same order retry vs a second redemption for this customer. */
export function classifyFlashSaleInsertConflict(
  message: string
): "idempotent" | "already_redeemed" | null {
  const msg = String(message ?? "");
  if (
    /flash_sale_redemptions_customer_offer_active_uidx|flash_sale_redemptions_customer_store_offer_active_uidx|flash_sale_redemptions_customer_offer_nostore_active_uidx/i.test(
      msg
    )
  ) {
    return "already_redeemed";
  }
  if (
    /flash_sale_redemptions_offer_order_uidx|flash_sale_redemptions_offer_order_text_uidx|flash_sale_redemptions_idempotency_uidx/i.test(
      msg
    )
  ) {
    return "idempotent";
  }
  return null;
}
