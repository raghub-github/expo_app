/**
 * Runtime FLASH_SALE overlay on customer item prices.
 * Does not mutate catalogue rows or discounted CTM / merchant settlement inputs.
 */

import type { NormalizedOrderItem } from "../orders/orderNormalizer.js";
import {
  emptyFlashSaleOverlay,
  flashPriceForMenuItem,
  flashSaleItemsFromOffer,
  isFoodFlashSale,
  menuRowEligibleForFlashOverlay,
  mergeFlashSaleSnapshot,
  overlayFlashCustomerUnit,
  readClientFlashSaleOfferId,
  readClientFlashSalePrice,
  resolveMaxFlashQuantity,
  type FlashSaleOverlaySummary,
} from "./flashSale.js";
import { platformOfferEligible } from "./platformOffersApply.js";
import type { AppliedLine, BillContext, BillingDataset, MutableBillState, PlatformOfferRow } from "./types.js";

function round2(n: number): number {
  return Math.round((Number.isFinite(n) ? n : 0) * 100) / 100;
}

function aliasesForItem(item: NormalizedOrderItem, ctx: BillContext): string[] {
  const pk = String(item.menuItemId);
  return ctx.menuIdAliasesByLineId?.get(pk) ?? [];
}

/**
 * Catalogue menu overlay already bakes flash into `customer_item_price_unit`.
 * Prefer strike / flash_sale.original_customer_unit so checkout split math uses the
 * real regular price — never treat the flash unit as the "original".
 */
function resolveOriginalCustomerUnit(
  canonicalRaw: Record<string, unknown>,
  snap: Record<string, unknown>,
  itemBasePrice: number
): number {
  const flashBlobRaw =
    (snap.flash_sale && typeof snap.flash_sale === "object"
      ? snap.flash_sale
      : null) ??
    (canonicalRaw.flash_sale && typeof canonicalRaw.flash_sale === "object"
      ? canonicalRaw.flash_sale
      : null);
  const flashBlob =
    flashBlobRaw && typeof flashBlobRaw === "object"
      ? (flashBlobRaw as Record<string, unknown>)
      : null;
  const fromFlash = Number(
    flashBlob?.original_customer_unit ?? flashBlob?.originalCustomerUnit
  );
  if (Number.isFinite(fromFlash) && fromFlash > 0) return round2(fromFlash);

  const fromStrike = Number(
    canonicalRaw.customer_strike_unit ??
      snap.customer_strike_price ??
      snap.customerStrikePrice
  );
  const fromUnit = Number(canonicalRaw.customer_item_price_unit);
  if (Number.isFinite(fromStrike) && fromStrike > 0) {
    if (!Number.isFinite(fromUnit) || fromStrike > fromUnit + 0.001) {
      return round2(fromStrike);
    }
  }
  if (Number.isFinite(fromUnit) && fromUnit > 0) return round2(fromUnit);
  return round2(itemBasePrice);
}

function flashSaleConfigMenuItemId(
  offer: PlatformOfferRow,
  menuItemId: unknown,
  extras: string[]
): string {
  for (const it of flashSaleItemsFromOffer(offer)) {
    if (flashPriceForMenuItem([it], menuItemId, extras) != null) return it.menuItemId;
  }
  return String(menuItemId ?? "");
}

export function eligibleFoodFlashSaleOffers(
  ctx: BillContext,
  dataset: BillingDataset,
  itemPlusAddon: number
): PlatformOfferRow[] {
  const out: PlatformOfferRow[] = [];
  for (const o of dataset.platformOffers) {
    if (!isFoodFlashSale(o)) continue;
    if (flashSaleItemsFromOffer(o).length === 0) continue;
    // platformOfferEligible uses flash-aware locationVisible (MERCHANT flash ≠ geo-bound).
    if (!platformOfferEligible(ctx, o, itemPlusAddon)) continue;
    out.push(o);
  }
  return out;
}

export function applyFoodFlashSaleOverlayToItems(args: {
  items: NormalizedOrderItem[];
  ctx: BillContext;
  dataset: BillingDataset;
}): {
  items: NormalizedOrderItem[];
  overlay: FlashSaleOverlaySummary;
  staleClientFlash: boolean;
  stalePrice: boolean;
  qtyExceeded: {
    offerId: number;
    requestedQuantity: number;
    maxFlashQuantity: number;
  } | null;
} {
  const itemPlusAddon = Math.max(0, args.ctx.itemSubtotal + args.ctx.addonSubtotal);
  const offers = eligibleFoodFlashSaleOffers(args.ctx, args.dataset, itemPlusAddon);
  const overlay: FlashSaleOverlaySummary = emptyFlashSaleOverlay();
  let staleClientFlash = false;
  let stalePrice = false;
  const appliedOfferIds = new Set<number>();
  const usedQtyByOfferItem = new Map<string, number>();

  const items = args.items.map((item) => {
    const extras = aliasesForItem(item, args.ctx);
    const clientOfferId = readClientFlashSaleOfferId(item.itemSnapshot);
    const snap =
      item.itemSnapshot && typeof item.itemSnapshot === "object" ? { ...item.itemSnapshot } : {};
    const canonicalRaw =
      snap.canonical_pricing && typeof snap.canonical_pricing === "object"
        ? { ...(snap.canonical_pricing as Record<string, unknown>) }
        : {};
    const originalUnit = resolveOriginalCustomerUnit(canonicalRaw, snap, item.basePrice);

    let applied: PlatformOfferRow | null = null;
    let flashPrice: number | null = null;
    for (const o of offers) {
      const price = flashPriceForMenuItem(flashSaleItemsFromOffer(o), item.menuItemId, extras);
      if (price == null) continue;
      const next = overlayFlashCustomerUnit(originalUnit, price);
      if (!next) continue;
      applied = o;
      flashPrice = next.unit;
      break;
    }

    if (!applied || flashPrice == null) {
      if (clientOfferId != null) staleClientFlash = true;
      return item;
    }

    const qty = Math.max(1, Math.floor(item.quantity) || 1);
    const maxFlashQuantity = resolveMaxFlashQuantity(applied.conditions);
    const usageKey = `${applied.id}:${flashSaleConfigMenuItemId(applied, item.menuItemId, extras)}`;
    const already = usedQtyByOfferItem.get(usageKey) ?? 0;
    // Soft cap: flash price only for remaining budget units; excess stay at regular unit price.
    const flashQty = Math.min(qty, Math.max(0, maxFlashQuantity - already));
    if (flashQty <= 0) {
      // Entire line is past the Flash Sale unit budget — charge regular catalogue price.
      if (clientOfferId != null) staleClientFlash = true;
      return {
        ...item,
        basePrice: originalUnit,
        isDiscountEligible: false,
        itemSnapshot: {
          ...snap,
          customer_strike_price: originalUnit,
        },
      };
    }
    usedQtyByOfferItem.set(usageKey, already + flashQty);
    const math = overlayFlashCustomerUnit(originalUnit, flashPrice)!;
    const clientPrice = readClientFlashSalePrice(item.itemSnapshot);
    if (clientOfferId != null && clientOfferId !== applied.id) stalePrice = true;
    // Client may still send the pure flash unit while qty is mixed — only flag stale when
    // the whole line is still within the flash budget (flashQty === qty).
    if (
      flashQty === qty &&
      clientPrice != null &&
      Math.abs(clientPrice - math.unit) > 0.05
    ) {
      stalePrice = true;
    }
    const subsidyLine = round2(math.subsidyUnit * flashQty);
    const regularQty = qty - flashQty;
    const blendedUnit =
      regularQty > 0
        ? round2((math.unit * flashQty + originalUnit * regularQty) / qty)
        : math.unit;
    const merged = mergeFlashSaleSnapshot(canonicalRaw, {
      offerId: applied.id,
      originalCustomerUnit: originalUnit,
      flashUnit: math.unit,
      quantity: flashQty,
      orderedQuantity: qty,
      subsidyLine,
      maxFlashQuantity,
    });
    overlay.lines.push({
      menuItemId: String(item.menuItemId),
      quantity: flashQty,
      originalUnit,
      flashUnit: math.unit,
      subsidyLine,
      offerId: applied.id,
    });
    overlay.subsidyTotal = round2(overlay.subsidyTotal + subsidyLine);
    appliedOfferIds.add(applied.id);

    return {
      ...item,
      basePrice: blendedUnit,
      isDiscountEligible: false,
      itemSnapshot: {
        ...snap,
        canonical_pricing: merged,
        flash_sale: (merged as { flash_sale?: unknown }).flash_sale,
        customer_strike_price: originalUnit,
      },
    };
  });

  overlay.offerIds = [...appliedOfferIds];
  return {
    items,
    overlay,
    staleClientFlash: staleClientFlash && overlay.lines.length === 0,
    stalePrice,
    // Soft cap — over-limit units use regular price; never hard-block the cart.
    qtyExceeded: null,
  };
}

export function stampFlashSaleSubsidyLines(
  ctx: BillContext,
  state: MutableBillState
): void {
  const overlay = ctx.flashSaleOverlay;
  if (!overlay || overlay.lines.length === 0 || overlay.subsidyTotal <= 0.0001) return;

  const byOffer = new Map<
    number,
    { subsidy: number; items: string[]; original: number; flash: number }
  >();
  for (const line of overlay.lines) {
    const cur = byOffer.get(line.offerId) ?? { subsidy: 0, items: [], original: 0, flash: 0 };
    cur.subsidy = round2(cur.subsidy + line.subsidyLine);
    cur.original = round2(cur.original + line.originalUnit * line.quantity);
    cur.flash = round2(cur.flash + line.flashUnit * line.quantity);
    if (!cur.items.includes(line.menuItemId)) cur.items.push(line.menuItemId);
    byOffer.set(line.offerId, cur);
  }

  for (const [offerId, row] of byOffer) {
    const applied: AppliedLine = {
      kind: "discount",
      label: "Flash Sale",
      amount: row.subsidy,
      hidden: true,
      meta: {
        platformOfferId: offerId,
        offerKind: "FLASH_SALE",
        fundingMode: "PLATFORM_ONLY",
        platformContribution: row.subsidy,
        merchantContribution: 0,
        doesNotReducePayable: true,
        flashSale: true,
        consumeMode: "ON_PLACED",
        itemIds: row.items,
        originalItemPrice: row.original,
        flashSalePrice: row.flash,
      },
    };
    state.discounts.push(applied);
    state.breakdown_steps.push({
      step: "Flash Sale (platform funded)",
      amount: 0,
      meta: { platformOfferId: offerId, subsidy: row.subsidy, doesNotReducePayable: true },
    });
  }
}

export function markFlashSaleOrderLines(ctx: BillContext): void {
  const overlay = ctx.flashSaleOverlay;
  if (!overlay || overlay.lines.length === 0) return;
  const hit = new Map(overlay.lines.map((l) => [l.menuItemId, l]));
  for (const line of ctx.orderLines ?? []) {
    const row = hit.get(String(line.menuItemId));
    if (!row) continue;
    line.discountEligible = false;
    line.ineligibilityReason = "ITEM_PROMO";
    line.appliedOfferId = row.offerId;
    line.appliedOfferLabel = "Flash Sale";
    line.appliedOfferType = "FLASH_SALE";
    line.offerDiscountAmount = 0;
    line.effectiveLineTotal = round2(row.flashUnit * row.quantity + Math.max(0, line.addonLineTotal ?? 0));
    line.boostAlreadyInPrice = true;
    const snap = line.canonicalPricing ? { ...line.canonicalPricing } : {};
    line.canonicalPricing = mergeFlashSaleSnapshot(snap, {
      offerId: row.offerId,
      originalCustomerUnit: row.originalUnit,
      flashUnit: row.flashUnit,
      quantity: row.quantity,
      subsidyLine: row.subsidyLine,
    });
  }
}

export type MenuFlashSaleRow = {
  id?: number;
  item_id?: string | null;
  selling_price: string;
  customer_strike_price?: string;
  canonical_pricing?: Record<string, unknown>;
  flash_sale?: Record<string, unknown>;
  in_stock?: boolean | null;
  is_active?: boolean | null;
  is_locked_by_plan?: boolean | null;
  effective_in_stock?: boolean | null;
};

export function overlayFlashSaleOnMenuRows<T extends MenuFlashSaleRow>(
  items: T[],
  offers: PlatformOfferRow[]
): T[] {
  if (items.length === 0 || offers.length === 0) return items;
  for (const it of items) {
    if (!menuRowEligibleForFlashOverlay(it)) continue;
    const extras = it.item_id ? [String(it.item_id)] : [];
    const original = parseFloat(String(it.selling_price));
    if (!Number.isFinite(original) || original <= 0) continue;
    for (const o of offers) {
      const price = flashPriceForMenuItem(flashSaleItemsFromOffer(o), it.id, extras);
      if (price == null) continue;
      const next = overlayFlashCustomerUnit(original, price);
      if (!next) continue;
      it.selling_price = next.unit.toFixed(2);
      it.customer_strike_price = original.toFixed(2);
      const canon =
        it.canonical_pricing && typeof it.canonical_pricing === "object" ? { ...it.canonical_pricing } : {};
      const merged = mergeFlashSaleSnapshot(canon, {
        offerId: o.id,
        originalCustomerUnit: original,
        flashUnit: next.unit,
        quantity: 1,
        subsidyLine: next.subsidyUnit,
        maxFlashQuantity: resolveMaxFlashQuantity(o.conditions),
      });
      it.canonical_pricing = merged;
      it.flash_sale = (merged.flash_sale as Record<string, unknown>) ?? {
        offer_id: o.id,
        original_customer_unit: original,
        flash_price: next.unit,
        subsidy_unit: next.subsidyUnit,
      };
      break;
    }
  }
  return items;
}
