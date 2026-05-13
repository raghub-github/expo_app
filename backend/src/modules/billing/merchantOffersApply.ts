import type {
  AppliedLine,
  BillContext,
  BillingDataset,
  FeeRem,
  MerchantOfferRow,
  MutableBillState,
} from "./types.js";

function num(v: unknown): number {
  if (v == null) return 0;
  const x = typeof v === "number" ? v : parseFloat(String(v));
  return Number.isFinite(x) ? x : 0;
}

function normalizeMenuId(v: unknown): string {
  return String(v ?? "").trim();
}

/** Subtotal for lines whose menu_item_id is in the allowed set (empty = full cart). */
function eligibleSubtotal(ctx: BillContext, offer: MerchantOfferRow, grossCart: number): number {
  const meta = offer.metadata ?? {};
  const raw = meta.menu_item_ids ?? meta.menuItemIds;
  if (!Array.isArray(raw) || raw.length === 0) return grossCart;
  const allow = new Set(raw.map(normalizeMenuId));
  let sum = 0;
  for (const line of ctx.orderLines ?? []) {
    if (allow.has(normalizeMenuId(line.menuItemId))) sum += line.lineTotal;
  }
  return sum;
}

/** Check applicable_on_days and time window. Returns true if no restriction set. */
function timeEligible(offer: MerchantOfferRow, now: Date): boolean {
  if (offer.applicableOnDays && offer.applicableOnDays.length > 0) {
    const dayNames = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
    const today = dayNames[now.getDay()];
    const allowed = offer.applicableOnDays.map((d) => d.toLowerCase().slice(0, 3));
    if (!allowed.includes(today)) return false;
  }
  if (offer.applicableTimeStart && offer.applicableTimeEnd) {
    const hhmm = now.toTimeString().slice(0, 5);
    if (hhmm < offer.applicableTimeStart || hhmm > offer.applicableTimeEnd) return false;
  }
  return true;
}

/** Check first_order_only / new_user_only eligibility from ctx.userSegment. */
function segmentEligible(offer: MerchantOfferRow, ctx: BillContext): boolean {
  if (offer.firstOrderOnly || offer.newUserOnly) {
    if (ctx.userSegment !== "NEW") return false;
  }
  return true;
}

/** Check per-user usage cap. Returns false if limit exceeded. */
function usageCapExceeded(offer: MerchantOfferRow, ctx: BillContext): boolean {
  if (!offer.maxUsesPerUser || !ctx.merchantOfferUsagesByUser) return false;
  const used = ctx.merchantOfferUsagesByUser.get(offer.id) ?? 0;
  return used >= offer.maxUsesPerUser;
}

/** Push a discount AppliedLine and update the billing state. */
function pushDiscount(
  state: MutableBillState,
  rem: FeeRem,
  bucket: keyof FeeRem,
  amt: number,
  label: string,
  offerId: number,
  source = "merchant_offers"
): void {
  if (amt <= 0) return;
  rem[bucket] -= amt;
  state.discountTotal += amt;
  const line: AppliedLine = {
    kind: "discount",
    label,
    amount: amt,
    hidden: false,
    meta: { merchantOfferId: offerId, source },
  };
  state.discounts.push(line);
  state.breakdown_steps.push({ step: label, amount: -amt, meta: { merchantOfferId: offerId } });
}

// ---------------------------------------------------------------------------
// Offer-type handlers
// ---------------------------------------------------------------------------

function applyPercentageOrFlat(
  ctx: BillContext,
  state: MutableBillState,
  rem: FeeRem,
  offer: MerchantOfferRow,
  grossCart: number,
  isCart: boolean
): void {
  const base = isCart ? grossCart : eligibleSubtotal(ctx, offer, grossCart);
  if (base <= 0) return;

  const poolShare = grossCart > 0 ? base / grossCart : 0;
  const afterDiscBase = Math.max(0, rem.items) * poolShare;

  const t = offer.offerType.toUpperCase();
  let amt = 0;
  if (t === "PERCENTAGE" || t === "CART_PERCENTAGE") {
    const pct = num(offer.discountPercentage);
    if (pct <= 0) return;
    amt = (afterDiscBase * pct) / 100;
  } else {
    amt = num(offer.discountValue);
  }
  const cap = num(offer.maxDiscountAmount);
  if (cap > 0) amt = Math.min(amt, cap);
  const orderCap = num(offer.maxDiscountPerOrder);
  if (orderCap > 0) amt = Math.min(amt, orderCap);
  amt = Math.min(Math.max(0, amt), afterDiscBase);
  pushDiscount(state, rem, "items", amt, (offer.title || `Offer #${offer.id}`).trim(), offer.id);
}

function applyCoupon(
  ctx: BillContext,
  state: MutableBillState,
  rem: FeeRem,
  offer: MerchantOfferRow,
  grossCart: number
): void {
  if (!offer.couponCode) return;
  if (!ctx.couponCode || ctx.couponCode.toUpperCase() !== offer.couponCode.toUpperCase()) return;

  const afterDiscBase = Math.max(0, rem.items);
  let amt = 0;
  if (offer.discountPercentage != null && num(offer.discountPercentage) > 0) {
    amt = (afterDiscBase * num(offer.discountPercentage)) / 100;
  } else {
    amt = num(offer.discountValue);
  }
  const cap = num(offer.maxDiscountAmount);
  if (cap > 0) amt = Math.min(amt, cap);
  amt = Math.min(Math.max(0, amt), afterDiscBase);
  const label = `Coupon ${offer.couponCode}`;
  pushDiscount(state, rem, "items", amt, label, offer.id);
}

function applyFreeDelivery(
  state: MutableBillState,
  rem: FeeRem,
  offer: MerchantOfferRow,
  grossCart: number
): void {
  const minOrder = num(offer.minOrderAmount);
  if (minOrder > 0 && grossCart < minOrder) return;
  if (rem.delivery <= 0) return;
  let waiver = rem.delivery;
  const cap = num(offer.maxDiscountAmount);
  if (cap > 0) waiver = Math.min(waiver, cap);
  waiver = Math.max(0, waiver);
  if (waiver <= 0) return;
  rem.delivery -= waiver;
  state.deliveryFee = Math.max(0, state.deliveryFee - waiver);
  state.discountTotal += waiver;
  const label = (offer.title || "Free Delivery").trim();
  state.discounts.push({ kind: "discount", label, amount: waiver, hidden: false, meta: { merchantOfferId: offer.id, source: "merchant_offers" } });
  state.breakdown_steps.push({ step: label, amount: -waiver, meta: { merchantOfferId: offer.id } });
}

function applyBuyNGetM(
  ctx: BillContext,
  state: MutableBillState,
  rem: FeeRem,
  offer: MerchantOfferRow,
  grossCart: number
): void {
  const buyN = offer.buyQuantity ?? 0;
  const getM = offer.getQuantity ?? 0;
  if (buyN <= 0 || getM <= 0) return;

  const lines = ctx.orderLines ?? [];
  if (lines.length === 0) return;

  // Determine eligible lines (item-scoped if menu_item_ids set)
  const meta = offer.metadata ?? {};
  const rawIds = meta.menu_item_ids ?? meta.menuItemIds;
  const allowSet: Set<string> | null = Array.isArray(rawIds) && rawIds.length > 0
    ? new Set(rawIds.map(normalizeMenuId))
    : null;
  const eligible = allowSet
    ? lines.filter((l) => allowSet.has(normalizeMenuId(l.menuItemId)))
    : [...lines];

  // Expand into unit-priced items
  const units: { price: number }[] = [];
  for (const l of eligible) {
    const unitPrice = l.quantity > 0 ? l.lineTotal / l.quantity : 0;
    for (let i = 0; i < l.quantity; i++) units.push({ price: unitPrice });
  }

  const groupSize = buyN + getM;
  if (units.length < groupSize) return;

  // Sort ascending so cheapest are "free"
  units.sort((a, b) => a.price - b.price);

  let totalDiscount = 0;
  let start = 0;
  while (start + groupSize <= units.length) {
    // The M cheapest in the group are free
    const group = units.slice(start, start + groupSize).sort((a, b) => a.price - b.price);
    for (let i = 0; i < getM; i++) totalDiscount += group[i].price;
    start += groupSize;
  }

  const cap = num(offer.maxDiscountAmount);
  if (cap > 0) totalDiscount = Math.min(totalDiscount, cap);
  totalDiscount = Math.min(Math.max(0, totalDiscount), Math.max(0, rem.items));
  const label = offer.title?.trim() || `Buy ${buyN} Get ${getM}`;
  pushDiscount(state, rem, "items", totalDiscount, label, offer.id);
}

function applyFreeItem(
  ctx: BillContext,
  state: MutableBillState,
  rem: FeeRem,
  offer: MerchantOfferRow,
  grossCart: number
): void {
  const meta = offer.metadata ?? {};
  const freeItemIds: string[] = Array.isArray(meta.free_item_ids)
    ? (meta.free_item_ids as unknown[]).map(normalizeMenuId)
    : [];
  const freeQty: number = typeof meta.free_item_qty === "number" ? meta.free_item_qty : 1;

  if (freeItemIds.length === 0) return;
  const minOrder = num(offer.minOrderAmount);
  if (minOrder > 0 && grossCart < minOrder) return;

  let totalDiscount = 0;
  for (const line of ctx.orderLines ?? []) {
    if (!freeItemIds.includes(normalizeMenuId(line.menuItemId))) continue;
    const unitPrice = line.quantity > 0 ? line.lineTotal / line.quantity : 0;
    const qtyToFree = Math.min(line.quantity, freeQty);
    totalDiscount += unitPrice * qtyToFree;
  }
  const cap = num(offer.maxDiscountAmount);
  if (cap > 0) totalDiscount = Math.min(totalDiscount, cap);
  totalDiscount = Math.min(Math.max(0, totalDiscount), Math.max(0, rem.items));
  const label = offer.title?.trim() || "Free Item";
  pushDiscount(state, rem, "items", totalDiscount, label, offer.id);
}

function applyTiered(
  ctx: BillContext,
  state: MutableBillState,
  rem: FeeRem,
  offer: MerchantOfferRow,
  grossCart: number
): void {
  const meta = offer.metadata ?? {};
  const tiers = Array.isArray(meta.tiers) ? (meta.tiers as Array<{
    min_order: number;
    discount_pct?: number;
    discount_flat?: number;
  }>) : [];
  if (tiers.length === 0) return;

  // Pick the highest qualifying tier
  const qualifying = tiers
    .filter((t) => grossCart >= num(t.min_order))
    .sort((a, b) => num(b.min_order) - num(a.min_order));
  if (qualifying.length === 0) return;
  const tier = qualifying[0];

  const afterDiscBase = Math.max(0, rem.items);
  let amt = 0;
  if (tier.discount_pct != null && num(tier.discount_pct) > 0) {
    amt = (afterDiscBase * num(tier.discount_pct)) / 100;
  } else if (tier.discount_flat != null) {
    amt = num(tier.discount_flat);
  }
  const cap = num(offer.maxDiscountAmount);
  if (cap > 0) amt = Math.min(amt, cap);
  amt = Math.min(Math.max(0, amt), afterDiscBase);
  const label = offer.title?.trim() || "Tiered Offer";
  pushDiscount(state, rem, "items", amt, label, offer.id);
}

function applyBundle(
  ctx: BillContext,
  state: MutableBillState,
  rem: FeeRem,
  offer: MerchantOfferRow
): void {
  const meta = offer.metadata ?? {};
  const bundleItems: Array<{ item_id: string; qty: number }> = Array.isArray(meta.bundle_items)
    ? (meta.bundle_items as Array<{ item_id: string; qty: number }>)
    : [];
  if (bundleItems.length === 0) return;

  // Verify all bundle items are in the cart with required qty
  for (const bi of bundleItems) {
    const line = ctx.orderLines?.find((l) => normalizeMenuId(l.menuItemId) === normalizeMenuId(bi.item_id));
    if (!line || line.quantity < bi.qty) return;
  }

  // Compute bundle subtotal
  let bundleSubtotal = 0;
  for (const bi of bundleItems) {
    const line = ctx.orderLines?.find((l) => normalizeMenuId(l.menuItemId) === normalizeMenuId(bi.item_id));
    if (!line) return;
    const unitPrice = line.quantity > 0 ? line.lineTotal / line.quantity : 0;
    bundleSubtotal += unitPrice * bi.qty;
  }

  let amt = 0;
  if (offer.discountPercentage != null && num(offer.discountPercentage) > 0) {
    amt = (bundleSubtotal * num(offer.discountPercentage)) / 100;
  } else {
    amt = num(offer.discountValue);
  }
  const cap = num(offer.maxDiscountAmount);
  if (cap > 0) amt = Math.min(amt, cap);
  amt = Math.min(Math.max(0, amt), Math.max(0, rem.items));
  const label = offer.title?.trim() || "Bundle Deal";
  pushDiscount(state, rem, "items", amt, label, offer.id);
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

/**
 * Apply merchant store offers from `merchant_offers` table.
 * Handles all 12 canonical offer types:
 * PERCENTAGE, FLAT, CART_PERCENTAGE, CART_FLAT, COUPON, FREE_DELIVERY,
 * BUY_X_GET_Y, BUY_N_GET_M, BOGO, FREE_ITEM, TIERED, BUNDLE
 */
export function applyMerchantStoreOffers(
  ctx: BillContext,
  dataset: BillingDataset,
  state: MutableBillState,
  itemPlusAddon: number,
  rem: FeeRem
): void {
  const grossCart = itemPlusAddon;
  const now = ctx.now;

  const sorted = [...dataset.merchantOffers].sort(
    (a, b) => b.displayPriority - a.displayPriority || a.id - b.id
  );

  for (const offer of sorted) {
    // Per-user usage cap
    if (usageCapExceeded(offer, ctx)) continue;

    // Time-based eligibility
    if (!timeEligible(offer, now)) continue;

    // Segment eligibility
    if (!segmentEligible(offer, ctx)) continue;

    // Min order gate (skip for offer types that handle it internally)
    const minOrder = num(offer.minOrderAmount);
    if (minOrder > 0 && grossCart < minOrder) continue;

    const t = offer.offerType.toUpperCase();

    switch (t) {
      case "PERCENTAGE":
      case "FLAT":
        applyPercentageOrFlat(ctx, state, rem, offer, grossCart, false);
        break;

      case "CART_PERCENTAGE":
      case "CART_FLAT":
        applyPercentageOrFlat(ctx, state, rem, offer, grossCart, true);
        break;

      case "COUPON":
        applyCoupon(ctx, state, rem, offer, grossCart);
        break;

      case "FREE_DELIVERY":
        applyFreeDelivery(state, rem, offer, grossCart);
        break;

      case "BUY_X_GET_Y":
      case "BUY_N_GET_M":
      case "BOGO":
        applyBuyNGetM(ctx, state, rem, offer, grossCart);
        break;

      case "FREE_ITEM":
        applyFreeItem(ctx, state, rem, offer, grossCart);
        break;

      case "TIERED":
        applyTiered(ctx, state, rem, offer, grossCart);
        break;

      case "BUNDLE":
        applyBundle(ctx, state, rem, offer);
        break;

      default:
        // Unknown type — skip silently
        break;
    }
  }
}
