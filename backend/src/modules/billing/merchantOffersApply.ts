import type {
  AppliedLine,
  BillContext,
  BillingDataset,
  FeeRem,
  MerchantOfferRow,
  MutableBillState,
} from "./types.js";
import { qualifyingCartFromRem } from "./platformOffersApply.js";
import {
  cartPromoQualifyingSubtotal,
  isItemSurfaceMerchantOffer,
} from "./discountEligibility.js";
import { parseMenuItemIdsFromMeta } from "../offers/offer-display-surface.js";
import { buildCheckoutOfferDisplayTitle } from "../merchants/merchant-offer-headline.js";

function num(v: unknown): number {
  if (v == null) return 0;
  const x = typeof v === "number" ? v : parseFloat(String(v));
  return Number.isFinite(x) ? x : 0;
}

function normalizeMenuId(v: unknown): string {
  return String(v ?? "").trim();
}

export { isItemSurfaceMerchantOffer };

function menuIdAliases(raw: unknown): string[] {
  const s = normalizeMenuId(raw);
  if (!s) return [];
  const out = new Set<string>([s]);
  // "menuId::variant" — the first "::" segment is the menu id (explicit, safe separator).
  if (s.includes("::")) {
    const base = s.split("::")[0]!;
    if (base) out.add(base);
    const asNum = Number(base);
    if (Number.isFinite(asNum) && asNum > 0) out.add(String(asNum));
  } else if (s.includes("_")) {
    // "_" only ever separates a NUMERIC menu id from a variant suffix ("102_half" → "102").
    // It must NOT be split for opaque store item ids like "HC77_d408a86767dbd6e1", where
    // "HC77" is a STORE prefix shared by EVERY item in the store — emitting it as an alias
    // makes one offer's item list alias-match every item in the store (cross-item offer
    // bleed: a BOGO on item A gets attributed to unrelated item B). Only a numeric prefix
    // is a real menu id.
    const prefix = s.split("_")[0]!;
    if (prefix && /^\d+$/.test(prefix)) out.add(prefix);
  }
  return [...out];
}

/** Cart line menu id + catalog item_id aliases from BillContext. */
function lineMenuAliases(ctx: BillContext, menuItemId: unknown): string[] {
  const out = new Set<string>(menuIdAliases(menuItemId));
  const key = normalizeMenuId(menuItemId);
  const extras =
    ctx.menuIdAliasesByLineId?.get(key) ??
    (key.includes("::") || key.includes("_")
      ? ctx.menuIdAliasesByLineId?.get(
          key.includes("::") ? key.split("::")[0]! : key.split("_")[0]!
        )
      : undefined);
  if (extras) {
    for (const e of extras) {
      for (const a of menuIdAliases(e)) out.add(a);
    }
  }
  return [...out];
}

/** Subtotal for lines whose menu_item_id is in the allowed set (empty = full cart). */
function eligibleSubtotal(ctx: BillContext, offer: MerchantOfferRow, grossCart: number): number {
  const raw = parseMenuItemIdsFromMeta(offer.metadata ?? {});
  if (!raw || raw.length === 0) return grossCart;
  const allow = new Set<string>();
  for (const id of raw) {
    for (const a of menuIdAliases(id)) allow.add(a);
  }
  let sum = 0;
  for (const line of ctx.orderLines ?? []) {
    if (lineMenuAliases(ctx, line.menuItemId).some((a) => allow.has(a))) sum += line.lineTotal;
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
  source = "merchant_offers",
  extraMeta?: Record<string, unknown>
): void {
  if (amt <= 0) return;
  rem[bucket] -= amt;
  state.discountTotal += amt;
  const line: AppliedLine = {
    kind: "discount",
    label,
    amount: amt,
    hidden: false,
    meta: { merchantOfferId: offerId, source, ...extraMeta },
  };
  state.discounts.push(line);
  state.breakdown_steps.push({
    step: label,
    amount: -amt,
    meta: { merchantOfferId: offerId, ...extraMeta },
  });
}

function offerDiscountMeta(offer: MerchantOfferRow): Record<string, unknown> {
  const itemSurface = isItemSurfaceMerchantOffer(offer);
  const meta = offer.metadata ?? {};
  const modeRaw = meta.conditions_mode ?? meta.conditionsMode ?? null;
  const mode =
    modeRaw != null && String(modeRaw).trim() !== ""
      ? String(modeRaw).toLowerCase().trim()
      : null;
  return {
    offerType: offer.offerType,
    itemSurface,
    cartSurface: !itemSurface,
    ...(mode ? { conditionsMode: mode } : {}),
    discountPercentage: offer.discountPercentage,
    discountValue: offer.discountValue,
  };
}

// ---------------------------------------------------------------------------
// Offer-type handlers
// ---------------------------------------------------------------------------

function targetedOrderLines(ctx: BillContext, offer: MerchantOfferRow) {
  const raw = parseMenuItemIdsFromMeta(offer.metadata ?? {});
  const lines = ctx.orderLines ?? [];
  if (!raw || raw.length === 0) return lines;
  const allow = new Set<string>();
  for (const id of raw) {
    for (const a of menuIdAliases(id)) allow.add(a);
  }
  return lines.filter((l) => lineMenuAliases(ctx, l.menuItemId).some((a) => allow.has(a)));
}

function attributeLineOffer(
  line: NonNullable<BillContext["orderLines"]>[number],
  off: number,
  offer: MerchantOfferRow,
  label: string
): void {
  const discount = Math.max(0, Math.round(off));
  if (discount <= 0) return;

  const newType = String(offer.offerType ?? "")
    .toUpperCase()
    .replace(/[-\s]+/g, "_");

  // A line already carrying a merchant-funded discount is LOCKED to that offer — no
  // other offer (a different item offer, or any cart-level Precision/Platform/Coupon
  // attribution reaching this line) may add to or relabel it. Re-attributing the SAME
  // offer id (e.g. multiple BOGO groups on one line) is intentionally still allowed.
  const alreadyLockedToAnotherOffer =
    line.appliedOfferId != null &&
    (line.offerDiscountAmount ?? 0) > 0.005 &&
    Math.floor(Number(line.appliedOfferId)) !== offer.id;

  // A BOGO / free-item / bundle deal is an ITEM offer that legitimately carries a ZERO per-line
  // discount (e.g. a qty-1 BOGO stamped for type only). The discount-based lock above misses it,
  // so a CART-surface offer (Precision/coupon) running afterwards would relabel this item's own
  // BOGO to a precision line — the mixed-cart bug where a BOGO persists as NONE. A cart-surface
  // offer must NEVER overwrite a line already owned by an item quantity deal, at any discount.
  const existingType = String(line.appliedOfferType ?? "")
    .toUpperCase()
    .replace(/[-\s]+/g, "_");
  const existingIsItemQuantityDeal =
    existingType === "BOGO" ||
    existingType === "BUY_X_GET_Y" ||
    existingType === "BUY_N_GET_M" ||
    existingType === "FREE_ITEM" ||
    existingType === "BUNDLE";
  const cartOfferOverItemDeal =
    !isItemSurfaceMerchantOffer(offer) &&
    existingIsItemQuantityDeal &&
    line.appliedOfferId != null &&
    Math.floor(Number(line.appliedOfferId)) !== offer.id;

  if (alreadyLockedToAnotherOffer || cartOfferOverItemDeal) {
    return;
  }

  line.offerDiscountAmount = Math.round((line.offerDiscountAmount ?? 0) + discount);
  line.effectiveLineTotal = Math.max(
    0,
    Math.round(line.lineTotal - (line.offerDiscountAmount ?? 0))
  );

  line.appliedOfferId = offer.id;
  line.appliedOfferLabel = label;
  line.appliedOfferType = offer.offerType;

  // Freeze merchant-configured % / flat — CTM must not invent % from disc÷gross.
  const pct = num(offer.discountPercentage);
  const flat = num(offer.discountValue);
  if (newType === "PERCENTAGE" || newType === "BOOST") {
    const pctResolved = pct > 0 ? pct : flat > 0 && flat <= 100 ? flat : 0;
    if (pctResolved > 0) line.appliedOfferDiscountPct = pctResolved;
  } else if (newType === "FLAT") {
    if (flat > 0) line.appliedOfferDiscountFlat = flat;
  }
}

function applyPercentageOrFlat(
  ctx: BillContext,
  state: MutableBillState,
  rem: FeeRem,
  offer: MerchantOfferRow,
  grossCart: number,
  isCart: boolean,
  /**
   * Menu-id aliases explicitly configured as a BOGO / free-item / bundle deal anywhere in the
   * merchant's offer set. Such an item is a BOGO item — never a Boost item — so a Boost (%/flat)
   * must exclude it from its eligible base AND attribution, independent of the order the offer
   * handlers happen to run in. This is what stops "BOGO increased the BOOST eligible subtotal".
   */
  bogoOwnedAliases?: Set<string>
): void {
  const t = offer.offerType.toUpperCase();
  const pct = num(offer.discountPercentage);
  const flat = num(offer.discountValue);
  const cap = num(offer.maxDiscountAmount);
  const orderCap = num(offer.maxDiscountPerOrder);
  // isBoostBranch mirrors the exact condition below that decides item- vs cart-surface
  // application — the customer-facing label must always match what the offers sheet
  // shows (buildCheckoutOfferDisplayTitle), never the raw offer.title, which is often
  // just a generic internal placeholder like "Precision"/"Boost" and breaks both the
  // Bill Summary copy and the sheet's "Applied" state (label/id matching against it).
  const isBoostBranch = !isCart && isItemSurfaceMerchantOffer(offer);
  const label = buildCheckoutOfferDisplayTitle({
    type: offer.offerType,
    offerTitle: offer.title,
    discountPct: offer.discountPercentage,
    discountVal: offer.discountValue,
    maxDiscount: offer.maxDiscountAmount,
    buyQty: offer.buyQuantity,
    getQty: offer.getQuantity,
    conditionsMode: isBoostBranch ? "boost" : "precision",
  }).trim();

  // Item-surface: attribute per line on catalog base (addons stay full price).
  if (isBoostBranch) {
    // Boost may only discount lines the eligibility engine (Offer Engine v2 SSOT,
    // markOrderLinesDiscountEligibility) flagged as item-promoted. A checkout-eligible
    // line has NO item offer and belongs to precision/coupon/platform — Boost must never
    // leak onto it (that both over-states the Boost base and double-discounts the line
    // with the checkout offer). This makes Boost application obey the exact same targeting
    // as every other discount, so the two engines can never disagree. Lines with unknown
    // eligibility (legacy/partner paths that skip marking) keep the prior targeted behavior.
    const lines = targetedOrderLines(ctx, offer).filter((l) => {
      // A line explicitly configured as a BOGO / free-item / bundle deal is a BOGO item, never a
      // Boost item. Exclude it here — BEFORE eligibility/lock checks — so its value can never
      // enter this Boost's base or `totalAmt`, no matter which handler ran first. Order-independent
      // SSOT for the "BOOST must never include BOGO items" rule.
      if (
        bogoOwnedAliases &&
        bogoOwnedAliases.size > 0 &&
        lineMenuAliases(ctx, l.menuItemId).some((a) => bogoOwnedAliases.has(a))
      ) {
        return false;
      }
      if (l.discountEligible === false) return l.ineligibilityReason !== "MRP"; // ITEM_PROMO only
      if (l.discountEligible === true) return false; // eligible → not a Boost line
      return true; // eligibility not computed (legacy) → preserve prior behavior
    });
    if (lines.length > 0) {
      let remaining =
        cap > 0 || orderCap > 0
          ? Math.min(cap > 0 ? cap : Number.POSITIVE_INFINITY, orderCap > 0 ? orderCap : Number.POSITIVE_INFINITY)
          : Number.POSITIVE_INFINITY;
      let totalAmt = 0;
      // PERCENTAGE offers often store the % in discount_value when discount_percentage is null.
      const pctResolved =
        t === "PERCENTAGE"
          ? pct > 0
            ? pct
            : flat > 0 && flat <= 100
              ? flat
              : 0
          : 0;
      for (const line of lines) {
        if (remaining <= 0) break;
        // A line already claimed by another item offer (e.g. a BOGO that ran first, even
        // at zero discount but stamped) is LOCKED to it — this Boost must neither touch
        // it nor count its value. Skipping here (not just relying on attributeLineOffer's
        // guard) is what keeps totalAmt / the pushed discount from being inflated by items
        // this offer never actually discounts.
        if (
          line.appliedOfferId != null &&
          Math.floor(Number(line.appliedOfferId)) !== offer.id
        ) {
          continue;
        }
        const base = Math.max(0, line.baseLineTotal ?? line.lineTotal);
        if (base <= 0) continue;
        let off = 0;
        if (t === "PERCENTAGE" && pctResolved > 0) {
          off = Math.round((base * pctResolved) / 100);
        } else if (t === "FLAT" && flat > 0) {
          const qty = Math.max(1, line.quantity);
          const unit = base / qty;
          const newUnit = Math.max(0, Math.round(unit - flat));
          off = Math.max(0, Math.round((unit - newUnit) * qty));
        } else if (flat > 0 && t !== "PERCENTAGE") {
          const qty = Math.max(1, line.quantity);
          const unit = base / qty;
          const newUnit = Math.max(0, Math.round(unit - flat));
          off = Math.max(0, Math.round((unit - newUnit) * qty));
        }
        off = Math.min(off, base, remaining);
        if (off <= 0) continue;
        attributeLineOffer(line, off, offer, label);
        remaining -= off;
        totalAmt += off;
      }
      if (totalAmt > 0) {
        totalAmt = Math.min(totalAmt, Math.max(0, rem.items));
        pushDiscount(state, rem, "items", totalAmt, label, offer.id, "merchant_offers", {
          ...offerDiscountMeta(offer),
          cartSurface: false,
          itemSurface: true,
        });
      }
    }
    // An item-surface offer (Boost/BOGO/item discount) must only ever discount the
    // item(s) it's actually configured for. If targetedOrderLines() found no matching
    // line (menu_item_ids configured but none alias-match this cart — a data mismatch,
    // or the targeted item just isn't in this cart) or the computed amount was 0
    // (misconfigured %), the offer contributes nothing — it must NEVER fall through to
    // the cart-wide proportional path below, which would spread an item-targeted
    // discount onto items the merchant never configured it for.
    return;
  }

  const eligiblePromo = cartPromoQualifyingSubtotal(ctx, grossCart);
  const base = isCart ? eligiblePromo : eligibleSubtotal(ctx, offer, grossCart);
  if (base <= 0) return;

  const poolShare = isCart
    ? 1
    : grossCart > 0
      ? base / grossCart
      : 0;
  const afterDiscBase = isCart
    ? Math.min(Math.max(0, rem.items), eligiblePromo)
    : Math.max(0, rem.items) * poolShare;

  let amt = 0;
  if (t === "PERCENTAGE" || t === "CART_PERCENTAGE") {
    const pctResolved =
      pct > 0 ? pct : flat > 0 && flat <= 100 ? flat : 0;
    if (pctResolved <= 0) return;
    amt = (afterDiscBase * pctResolved) / 100;
  } else {
    amt = flat;
  }
  if (cap > 0) amt = Math.min(amt, cap);
  if (orderCap > 0) amt = Math.min(amt, orderCap);
  amt = Math.min(Math.max(0, amt), afterDiscBase);
  amt = Math.round(amt);
  pushDiscount(
    state,
    rem,
    "items",
    amt,
    label,
    offer.id,
    "merchant_offers",
    {
      ...offerDiscountMeta(offer),
      cartSurface: isCart,
      itemSurface: isCart ? false : isItemSurfaceMerchantOffer(offer),
    }
  );
  // Cart / legacy path: freeze proportional share onto lines for order_line_pricing.
  if (amt > 0) {
    const targeted = isCart
      ? (ctx.orderLines ?? []).filter((l) => l.discountEligible !== false)
      : targetedOrderLines(ctx, offer);
    const linesForAttr =
      targeted.length > 0 ? targeted : (ctx.orderLines ?? []);
    attributeProportionalLineDiscount(linesForAttr, amt, offer, label);
  }
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

  const afterDiscBase = Math.min(
    Math.max(0, rem.items),
    cartPromoQualifyingSubtotal(ctx, grossCart)
  );
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
  pushDiscount(state, rem, "items", amt, label, offer.id, "merchant_offers", {
    ...offerDiscountMeta(offer),
    itemSurface: false,
    cartSurface: true,
  });
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
  state.discounts.push({
    kind: "discount",
    label,
    amount: waiver,
    hidden: false,
    meta: {
      merchantOfferId: offer.id,
      source: "merchant_offers",
      ...offerDiscountMeta(offer),
      itemSurface: false,
    },
  });
  state.breakdown_steps.push({
    step: label,
    amount: -waiver,
    meta: { merchantOfferId: offer.id, itemSurface: false },
  });
}

/** Canonical merchant BOGO badge: Buy One Get One / Buy Two Get One / … */
export function formatBuyGetOfferName(buyN: number, getM: number): string {
  const word = (n: number): string => {
    const w = [
      "Zero",
      "One",
      "Two",
      "Three",
      "Four",
      "Five",
      "Six",
      "Seven",
      "Eight",
      "Nine",
      "Ten",
    ];
    if (Number.isFinite(n) && n >= 0 && n < w.length) return w[n]!;
    return String(Math.max(0, Math.round(n)));
  };
  const buy = Math.max(1, Math.round(buyN));
  const get = Math.max(1, Math.round(getM));
  return `Buy ${word(buy)} Get ${word(get)}`;
}

function applyBuyNGetM(
  ctx: BillContext,
  state: MutableBillState,
  rem: FeeRem,
  offer: MerchantOfferRow,
  grossCart: number,
  /** Ids of cart-surface offers (Precision / cart %/flat / coupon) — see reclaim note below. */
  cartSurfaceOfferIds?: Set<number>
): void {
  // Merchant BOGO rows sometimes omit buy/get — treat as 1+1 (same as offers API).
  const buyN =
    offer.buyQuantity != null && offer.buyQuantity > 0 ? Math.round(offer.buyQuantity) : 1;
  const getM =
    offer.getQuantity != null && offer.getQuantity > 0 ? Math.round(offer.getQuantity) : 1;

  const lines = ctx.orderLines ?? [];
  if (lines.length === 0) return;

  // Prefer parseMenuItemIdsFromMeta (JSON-string / selected_item_ids) + aliases — same as eligibility.
  const parsedIds = parseMenuItemIdsFromMeta(offer.metadata ?? {});
  const allowSet: Set<string> | null =
    parsedIds != null && parsedIds.length > 0
      ? new Set(parsedIds.flatMap((id) => menuIdAliases(id)))
      : null;
  const targetedRaw = allowSet
    ? lines.filter((l) => lineMenuAliases(ctx, l.menuItemId).some((a) => allowSet.has(a)))
    : [...lines];
  // BOGO may only ever touch lines the eligibility engine (Offer Engine v2 SSOT,
  // markOrderLinesDiscountEligibility) flagged as item-promoted — never a checkout-eligible
  // line (which belongs to precision/coupon/platform). This makes BOGO application obey the
  // exact same targeting as boost and every other discount, so the two engines can never
  // disagree (a store-wide/broad BOGO can no longer free-unit a precision-eligible item).
  // Lines with unknown eligibility (legacy/partner paths that skip marking) keep prior behavior.
  const targeted = targetedRaw.filter((l) => {
    if (l.discountEligible === false) return l.ineligibilityReason !== "MRP"; // ITEM_PROMO only
    if (l.discountEligible === true) return false; // checkout-eligible → never a BOGO line
    return true;
  });
  const label = formatBuyGetOfferName(buyN, getM);

  // Stamp BOGO on every targeted line first (even Boost-free lines with qty 1) so CTM
  // always freezes type/name. A line owned by a genuine ITEM Boost keeps that Boost — but a line
  // only stamped by a CART/precision offer's proportional share must be RECLAIMED for this item's
  // own BOGO (precision is cart-level and lives in orders_core.merchant_precision_discount, never
  // on an item-offer line). Missing this is the mixed-cart bug: precision runs first, stamps the
  // BOGO item PERCENTAGE, and the BOGO then skips its own line → it persists as NONE.
  for (const l of targeted) {
    const t = String(l.appliedOfferType ?? "")
      .toUpperCase()
      .replace(/[-\s]+/g, "_");
    const existingId = l.appliedOfferId != null ? Math.floor(Number(l.appliedOfferId)) : null;
    const ownedByCartOffer =
      existingId != null &&
      existingId !== offer.id &&
      (cartSurfaceOfferIds?.has(existingId) ?? false);
    // Keep a genuine item Boost (%/flat) on its line; reclaim only from a cart/precision stamp.
    if ((t === "PERCENTAGE" || t === "FLAT" || t === "BOOST") && !ownedByCartOffer) continue;
    l.appliedOfferId = offer.id;
    l.appliedOfferLabel = label;
    l.appliedOfferType = offer.offerType;
    if (ownedByCartOffer) {
      // A precision/cart proportional share must not remain frozen on a BOGO item line. Reset so
      // the frozen line is a clean BOGO (net = gross); the cart discount total is unchanged (it was
      // already booked when that offer ran) and still surfaces via merchant_precision_discount.
      l.offerDiscountAmount = 0;
      l.effectiveLineTotal = l.lineTotal;
    }
  }

  const eligible = targeted.filter((l) => {
    const t = String(l.appliedOfferType ?? "")
      .toUpperCase()
      .replace(/[-\s]+/g, "_");
    return t !== "PERCENTAGE" && t !== "FLAT" && t !== "BOOST";
  });
  if (eligible.length === 0) return;

  // BOGO is per menu item — 1×A + 1×B must NOT become Buy-1-Get-1 across SKUs.
  const byMenuKey = new Map<string, NonNullable<BillContext["orderLines"]>>();
  for (let i = 0; i < eligible.length; i++) {
    const l = eligible[i]!;
    const aliases = lineMenuAliases(ctx, l.menuItemId);
    const mid = String(l.menuItemId ?? "").trim();
    const key = aliases[0] || mid || `line:${i}`;
    const bucket = byMenuKey.get(key) ?? [];
    bucket.push(l);
    byMenuKey.set(key, bucket);
  }

  const groupSize = buyN + getM;

  const pending: Array<{
    lines: NonNullable<BillContext["orderLines"]>;
    discount: number;
  }> = [];

  for (const groupLines of byMenuKey.values()) {
    const units: { price: number }[] = [];
    for (const l of groupLines) {
      const unitPrice = l.quantity > 0 ? l.lineTotal / l.quantity : 0;
      for (let u = 0; u < l.quantity; u++) units.push({ price: unitPrice });
    }
    if (units.length < groupSize) continue;

    units.sort((a, b) => a.price - b.price);
    let itemDiscount = 0;
    let start = 0;
    while (start + groupSize <= units.length) {
      const group = units.slice(start, start + groupSize).sort((a, b) => a.price - b.price);
      for (let i = 0; i < getM; i++) itemDiscount += group[i]!.price;
      start += groupSize;
    }
    itemDiscount = Math.round(Math.max(0, itemDiscount));
    if (itemDiscount > 0) pending.push({ lines: groupLines, discount: itemDiscount });
  }

  let totalDiscount = pending.reduce((s, p) => s + p.discount, 0);
  if (totalDiscount <= 0) return;

  const cap = num(offer.maxDiscountAmount);
  if (cap > 0) totalDiscount = Math.min(totalDiscount, cap);
  totalDiscount = Math.min(Math.max(0, totalDiscount), Math.max(0, rem.items));
  totalDiscount = Math.round(totalDiscount);
  if (totalDiscount <= 0) return;

  const rawSum = pending.reduce((s, p) => s + p.discount, 0);
  let allocated = 0;
  for (let i = 0; i < pending.length; i++) {
    const p = pending[i]!;
    const isLast = i === pending.length - 1;
    const share = isLast
      ? Math.max(0, totalDiscount - allocated)
      : Math.round((p.discount / rawSum) * totalDiscount);
    attributeProportionalLineDiscount(p.lines, share, offer, label);
    allocated += share;
  }

  pushDiscount(state, rem, "items", totalDiscount, label, offer.id, "merchant_offers", {
    ...offerDiscountMeta(offer),
    itemSurface: true,
    cartSurface: false,
  });
}

function attributeProportionalLineDiscount(
  lines: NonNullable<BillContext["orderLines"]>,
  totalDiscount: number,
  offer: MerchantOfferRow,
  label: string
): void {
  const amt = Math.max(0, Math.round(totalDiscount));
  if (amt <= 0 || lines.length === 0) return;
  const weights = lines.map((l) => Math.max(0, l.lineTotal));
  const sum = weights.reduce((s, w) => s + w, 0);
  if (sum <= 0) return;
  let allocated = 0;
  for (let i = 0; i < lines.length; i++) {
    const isLast = i === lines.length - 1;
    const share = isLast
      ? Math.max(0, amt - allocated)
      : Math.min(weights[i]!, Math.round((weights[i]! / sum) * amt));
    attributeLineOffer(lines[i]!, share, offer, label);
    allocated += share;
  }
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

  const label = offer.title?.trim() || "Free Item";
  let totalDiscount = 0;
  for (const line of ctx.orderLines ?? []) {
    const hit = freeItemIds.some((fid) =>
      lineMenuAliases(ctx, line.menuItemId).some((a) => menuIdAliases(fid).includes(a))
    );
    if (!hit) continue;
    const unitPrice = line.quantity > 0 ? line.lineTotal / line.quantity : 0;
    const qtyToFree = Math.min(line.quantity, freeQty);
    const off = Math.round(unitPrice * qtyToFree);
    if (off <= 0) continue;
    attributeLineOffer(line, off, offer, label);
    totalDiscount += off;
  }
  const cap = num(offer.maxDiscountAmount);
  if (cap > 0) totalDiscount = Math.min(totalDiscount, cap);
  totalDiscount = Math.min(Math.max(0, totalDiscount), Math.max(0, rem.items));
  totalDiscount = Math.round(totalDiscount);
  pushDiscount(state, rem, "items", totalDiscount, label, offer.id, "merchant_offers", {
    ...offerDiscountMeta(offer),
    itemSurface: true,
    cartSurface: false,
  });
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

  const afterDiscBase = Math.min(
    Math.max(0, rem.items),
    cartPromoQualifyingSubtotal(ctx, grossCart)
  );
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
  pushDiscount(state, rem, "items", amt, label, offer.id, "merchant_offers", {
    ...offerDiscountMeta(offer),
    itemSurface: false,
    cartSurface: true,
  });
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
  amt = Math.round(amt);
  const label = offer.title?.trim() || "Bundle Deal";
  const bundleLines = bundleItems
    .map((bi) =>
      ctx.orderLines?.find((l) => normalizeMenuId(l.menuItemId) === normalizeMenuId(bi.item_id))
    )
    .filter((l): l is NonNullable<BillContext["orderLines"]>[number] => l != null);
  attributeProportionalLineDiscount(bundleLines, amt, offer, label);
  pushDiscount(state, rem, "items", amt, label, offer.id, "merchant_offers", {
    ...offerDiscountMeta(offer),
    itemSurface: true,
    cartSurface: false,
  });
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
  applyMerchantStoreOffersFiltered(ctx, dataset, state, itemPlusAddon, rem, null);
}

/** Apply only menu Boost / BOGO offers (stacks with exclusive cart promo). */
export function applyItemSurfaceMerchantOffers(
  ctx: BillContext,
  dataset: BillingDataset,
  state: MutableBillState,
  itemPlusAddon: number,
  rem: FeeRem
): void {
  applyMerchantStoreOffersFiltered(ctx, dataset, state, itemPlusAddon, rem, "item_surface");
}

function applyMerchantStoreOffersFiltered(
  ctx: BillContext,
  dataset: BillingDataset,
  state: MutableBillState,
  itemPlusAddon: number,
  rem: FeeRem,
  surfaceFilter: "item_surface" | "cart_surface" | null
): void {
  const fullGross = qualifyingCartFromRem(itemPlusAddon, rem);
  // Cart-surface + unfiltered partner path: eligible lines only for min-order.
  // Item-surface Boost uses full cart (item promos are not gated by eligible subtotal).
  const grossCart =
    surfaceFilter === "item_surface"
      ? fullGross
      : cartPromoQualifyingSubtotal(ctx, itemPlusAddon);
  const now = ctx.now;

  // forceNoAutoOffer only blocks cart-surface / unfiltered auto-apply — never Boost/BOGO.
  if (
    surfaceFilter !== "item_surface" &&
    ctx.forceNoAutoOffer === true &&
    (ctx.selectedMerchantOfferId == null || ctx.selectedMerchantOfferId <= 0)
  ) {
    return;
  }

  let pool = dataset.merchantOffers;
  if (surfaceFilter === "item_surface") {
    pool = pool.filter(isItemSurfaceMerchantOffer);
  } else if (surfaceFilter === "cart_surface") {
    pool = pool.filter((o) => !isItemSurfaceMerchantOffer(o));
  }

  // Menu items explicitly configured as a BOGO / free-item / bundle deal — computed once from the
  // WHOLE offer set (not just the filtered pool) so a Boost can never count a BOGO item regardless
  // of surface filter or the order handlers run. Store-wide quantity deals (no explicit
  // menu_item_ids) are intentionally NOT added here — those are still handled by per-line
  // attribution + locking so a store-wide Boost is not nuked by a store-wide BOGO.
  const bogoOwnedAliases = new Set<string>();
  for (const o of dataset.merchantOffers ?? []) {
    const t = String(o.offerType ?? "").toUpperCase().replace(/[-\s]+/g, "_");
    const isQuantityDeal =
      t === "BOGO" ||
      t === "BUY_X_GET_Y" ||
      t === "BUY_N_GET_M" ||
      t === "FREE_ITEM" ||
      t === "BUNDLE";
    if (!isQuantityDeal) continue;
    const ids = parseMenuItemIdsFromMeta(o.metadata ?? {});
    if (!ids || ids.length === 0) continue;
    for (const id of ids) {
      for (const a of menuIdAliases(id)) bogoOwnedAliases.add(a);
    }
  }

  // Ids of every CART-surface merchant offer (Precision / cart %/flat / coupon). A cart offer that
  // proportionally stamped an item line does NOT own it — a later item BOGO must be able to reclaim
  // its own line from that stamp (see applyBuyNGetM). Computed from the WHOLE offer set so the
  // reclaim is independent of application order or surface filter.
  const cartSurfaceOfferIds = new Set<number>();
  for (const o of dataset.merchantOffers ?? []) {
    if (!isItemSurfaceMerchantOffer(o) && Number.isFinite(o.id)) cartSurfaceOfferIds.add(o.id);
  }

  const sorted = [...pool].sort(
    (a, b) => b.displayPriority - a.displayPriority || a.id - b.id
  );

  let toApply = sorted;
  const selectedId = ctx.selectedMerchantOfferId;
  // Cart/precision selection must NOT filter item-surface Boost/BOGO — those always auto-apply.
  if (surfaceFilter !== "item_surface" && selectedId != null && selectedId > 0) {
    toApply = sorted.filter((o) => o.id === selectedId);
  } else {
    toApply = sorted.filter((o) => {
      const t = o.offerType.toUpperCase();
      if (t === "COUPON") {
        const code = (o.couponCode ?? "").trim();
        if (!code) return false;
        const entered = (ctx.couponCode ?? "").trim().toUpperCase();
        return entered.length > 0 && entered === code.toUpperCase();
      }
      // Item-surface: always apply eligible Boost/BOGO (ignore autoApply=false misconfig).
      if (surfaceFilter === "item_surface") return true;
      return o.autoApply !== false;
    });
  }

  // Item-surface ordering: item-SPECIFIC offers (with menu_item_ids) claim their lines
  // BEFORE store-wide offers, so a store-wide Boost can never grab a line that a
  // more-specific BOGO/Boost owns (Rule 1: each item is locked to its own offer). Within
  // the same specificity, apply Boost (%/flat) before BOGO so free-item/BOGO offers
  // cannot relabel a Boost line.
  if (surfaceFilter === "item_surface") {
    const isSpecific = (o: MerchantOfferRow) => {
      const ids = parseMenuItemIdsFromMeta(o.metadata ?? {});
      return ids != null && ids.length > 0;
    };
    const typeRank = (o: MerchantOfferRow) => {
      const t = o.offerType.toUpperCase().replace(/[-\s]+/g, "_");
      if (t === "PERCENTAGE" || t === "FLAT") return 0;
      if (t === "BOGO" || t === "BUY_X_GET_Y" || t === "BUY_N_GET_M") return 2;
      return 1;
    };
    const rank = (o: MerchantOfferRow) => (isSpecific(o) ? 0 : 10) + typeRank(o);
    toApply = [...toApply].sort(
      (a, b) =>
        rank(a) - rank(b) || b.displayPriority - a.displayPriority || a.id - b.id
    );
  }

  let appliedNonStackable = false;

  for (const offer of toApply) {
    // Cart-surface: non-stackable winners block other cart promos.
    // Item-surface: Boost + BOGO must both run (different lines / Boost wins per line).
    if (
      surfaceFilter !== "item_surface" &&
      !selectedId &&
      appliedNonStackable &&
      !offer.isStackable
    ) {
      continue;
    }

    // Per-user usage cap
    if (usageCapExceeded(offer, ctx)) continue;

    // Time-based eligibility
    if (!timeEligible(offer, now)) continue;

    // Segment eligibility
    if (!segmentEligible(offer, ctx)) continue;

    // Min order gate — never block item-surface Boost/BOGO attribution (menu already shows them).
    const minOrder = num(offer.minOrderAmount);
    const tPre = offer.offerType.toUpperCase().replace(/[-\s]+/g, "_");
    const isItemBogoOrBoost =
      surfaceFilter === "item_surface" &&
      (tPre === "PERCENTAGE" ||
        tPre === "FLAT" ||
        tPre === "BOGO" ||
        tPre === "BUY_X_GET_Y" ||
        tPre === "BUY_N_GET_M");
    if (!isItemBogoOrBoost && minOrder > 0 && grossCart < minOrder) continue;

    const t = offer.offerType.toUpperCase();

    switch (t) {
      case "PERCENTAGE":
      case "FLAT":
        applyPercentageOrFlat(ctx, state, rem, offer, grossCart, false, bogoOwnedAliases);
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
        applyBuyNGetM(ctx, state, rem, offer, grossCart, cartSurfaceOfferIds);
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

    if (!offer.isStackable) appliedNonStackable = true;
  }
}

/** Cart-level merchant promos only (precision / coupon / free delivery) — for exclusive pick. */
export function applyCartSurfaceMerchantOffers(
  ctx: BillContext,
  dataset: BillingDataset,
  state: MutableBillState,
  itemPlusAddon: number,
  rem: FeeRem
): void {
  applyMerchantStoreOffersFiltered(ctx, dataset, state, itemPlusAddon, rem, "cart_surface");
}

/**
 * Backfill per-line offer attribution when discounts were applied without
 * attributeLineOffer (legacy cart-path / ID mismatch). Ensures order_line_pricing
 * always carries the Pricing Engine SSOT for merchant display.
 */
export function ensureOrderLineOfferAttribution(
  ctx: BillContext,
  state: MutableBillState
): void {
  const lines = ctx.orderLines ?? [];
  if (lines.length === 0) return;

  const itemDiscRows = state.discounts.filter((d) => {
    const meta = d.meta ?? {};
    const ot = String(meta.offerType ?? meta.offer_type ?? "").toUpperCase();
    if (ot === "FREE_DELIVERY") return false;
    // Platform / coupon without merchant offer — skip (not store item pricing).
    if (meta.merchantOfferId == null) return false;
    if (meta.itemSurface === true || meta.item_surface === true) return true;
    // Cart-surface precision / % still needs line freeze for merchant display.
    if (
      ot === "PERCENTAGE" ||
      ot === "FLAT" ||
      ot === "CART_PERCENTAGE" ||
      ot === "CART_FLAT" ||
      ot === "PRECISION" ||
      ot === "BOGO" ||
      ot === "BUY_X_GET_Y" ||
      ot === "BUY_N_GET_M" ||
      ot === "FREE_ITEM" ||
      ot === "BUNDLE" ||
      ot === "COUPON" ||
      ot === ""
    ) {
      return true;
    }
    return meta.cartSurface === true || meta.cart_surface === true;
  });
  if (itemDiscRows.length === 0) return;

  const attributedOfferIds = new Set<number>();
  for (const line of lines) {
    if (
      line.appliedOfferId != null &&
      Number.isFinite(line.appliedOfferId) &&
      (line.offerDiscountAmount ?? 0) > 0.005
    ) {
      attributedOfferIds.add(Math.floor(Number(line.appliedOfferId)));
    }
  }

  for (const d of itemDiscRows) {
    const amt = Math.max(0, Math.round(num(d.amount)));
    if (amt <= 0) continue;
    const meta = d.meta ?? {};
    const offerId =
      meta.merchantOfferId != null && Number.isFinite(Number(meta.merchantOfferId))
        ? Math.floor(Number(meta.merchantOfferId))
        : null;
    // Already frozen onto lines by applyPercentageOrFlat / BOGO / etc.
    if (offerId != null && attributedOfferIds.has(offerId)) continue;
    const label = String(d.label ?? "Store offer").trim() || "Store offer";
    const offerType = String(meta.offerType ?? meta.offer_type ?? "").trim() || null;
    const isCartSurface =
      meta.cartSurface === true ||
      meta.cart_surface === true ||
      meta.itemSurface === false ||
      meta.item_surface === false ||
      String(offerType ?? "")
        .toUpperCase()
        .replace(/[-\s]+/g, "_") === "PRECISION" ||
      String(offerType ?? "")
        .toUpperCase()
        .replace(/[-\s]+/g, "_") === "CART_PERCENTAGE" ||
      String(offerType ?? "")
        .toUpperCase()
        .replace(/[-\s]+/g, "_") === "CART_FLAT" ||
      String(offerType ?? "")
        .toUpperCase()
        .replace(/[-\s]+/g, "_") === "COUPON";

    // Cart/precision → eligible lines only. Item-surface → ITEM_PROMO / all lines.
    const promoLines = lines.filter(
      (l) => l.ineligibilityReason === "ITEM_PROMO" || l.discountEligible === false
    );
    const eligibleLines = lines.filter(
      (l) => l.ineligibilityReason !== "ITEM_PROMO" && l.discountEligible !== false
    );
    const targets = isCartSurface
      ? eligibleLines.length > 0
        ? eligibleLines
        : lines.filter((l) => (l.offerDiscountAmount ?? 0) <= 0.005)
      : promoLines.length > 0
        ? promoLines
        : lines;
    const pool = targets.length > 0 ? targets : lines;
    const weightSum = pool.reduce((s, l) => s + Math.max(0, l.lineTotal), 0);
    if (weightSum <= 0.005) continue;

    let allocated = 0;
    for (let i = 0; i < pool.length; i++) {
      const line = pool[i]!;
      const isLast = i === pool.length - 1;
      const share = isLast
        ? Math.max(0, amt - allocated)
        : Math.min(
            Math.max(0, line.lineTotal),
            Math.round((Math.max(0, line.lineTotal) / weightSum) * amt)
          );
      if (share <= 0) continue;
      const existingType = String(line.appliedOfferType ?? "")
        .toUpperCase()
        .replace(/[-\s]+/g, "_");
      const existingIsBoost =
        existingType === "PERCENTAGE" ||
        existingType === "FLAT" ||
        existingType === "BOOST";
      const otNorm = String(offerType ?? "")
        .toUpperCase()
        .replace(/[-\s]+/g, "_");
      // A line already carrying a merchant-funded discount is locked to that offer —
      // no other offer (cart-level Precision/Platform/Coupon backfill, or a different
      // item offer) may add to or relabel it. Re-attributing the SAME offer id (e.g.
      // multiple BOGO groups on one line) is intentionally still allowed through.
      const alreadyLockedToAnotherOffer =
        (line.offerDiscountAmount ?? 0) > 0.005 &&
        line.appliedOfferId != null &&
        offerId != null &&
        Number(line.appliedOfferId) !== offerId;
      // A BOGO / free-item / bundle line (an item quantity deal, legitimately 0-discount) must never
      // be relabeled by a cart-surface backfill (Precision/coupon) — same rule as attributeLineOffer.
      const existingIsItemQuantityDeal =
        existingType === "BOGO" ||
        existingType === "BUY_X_GET_Y" ||
        existingType === "BUY_N_GET_M" ||
        existingType === "FREE_ITEM" ||
        existingType === "BUNDLE";
      const cartBackfillOverItemDeal =
        isCartSurface &&
        existingIsItemQuantityDeal &&
        line.appliedOfferId != null &&
        offerId != null &&
        Number(line.appliedOfferId) !== offerId;
      if (alreadyLockedToAnotherOffer || cartBackfillOverItemDeal) {
        allocated += share;
        continue;
      }
      line.offerDiscountAmount = Math.round((line.offerDiscountAmount ?? 0) + share);
      line.effectiveLineTotal = Math.max(
        0,
        Math.round(line.lineTotal - (line.offerDiscountAmount ?? 0))
      );
      if (offerId != null) line.appliedOfferId = offerId;
      if (!existingIsBoost || isCartSurface) {
        line.appliedOfferLabel = label;
        if (offerType) {
          line.appliedOfferType = isCartSurface
            ? otNorm === "PERCENTAGE" || otNorm === "FLAT"
              ? "PRECISION"
              : offerType
            : offerType;
        }
      }
      allocated += share;
    }
    if (offerId != null) attributedOfferIds.add(offerId);
  }
}
