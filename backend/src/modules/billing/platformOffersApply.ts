import type {
  AppliedLine,
  BillContext,
  BillingDataset,
  FeeRem,
  MutableBillState,
  PlatformOfferRow,
} from "./types.js";

function num(v: unknown): number {
  if (v == null) return 0;
  const x = typeof v === "number" ? v : parseFloat(String(v));
  return Number.isFinite(x) ? x : 0;
}

/**
 * Offer min-order eligibility: sum of eligible item values (items + add-ons) only.
 * Delivery, platform/packaging fees, taxes, surge, tips, and other charges are excluded.
 */
export function qualifyingCartFromRem(itemPlusAddon: number, _rem: FeeRem): number {
  return Math.max(0, itemPlusAddon);
}

function nowInWindow(now: Date, startsAt: Date | null, endsAt: Date | null): boolean {
  if (startsAt && now < startsAt) return false;
  if (endsAt && now > endsAt) return false;
  return true;
}

function isCustomerCheckoutOffer(o: PlatformOfferRow): boolean {
  const a = String(o.offerAudience ?? "CUSTOMER").toUpperCase().trim();
  return a === "CUSTOMER";
}

function effectiveCustomerSegment(o: PlatformOfferRow): "ALL" | "NEW" | "EXISTING" {
  const row = String(o.customerSegment ?? "ALL").toUpperCase();
  if (row === "NEW" || row === "EXISTING") return row;
  const cond = (o.conditions ?? {}) as Record<string, unknown>;
  const seg = String(cond.user_segment ?? "ALL").toUpperCase();
  if (seg === "NEW" || seg === "EXISTING") return seg;
  return "ALL";
}

function effectiveMinOrderAmount(o: PlatformOfferRow): number {
  const row = num(o.minOrderAmount);
  if (row > 0) return row;
  const cond = (o.conditions ?? {}) as Record<string, unknown>;
  return num(cond.min_order_value);
}

export function platformOfferConditionsPass(conditions: Record<string, unknown>, ctx: BillContext): boolean {
  const city = conditions.city;
  if (typeof city === "string" && city.trim() !== "") {
    const want = city.trim().toLowerCase();
    const have = ctx.cityName?.trim().toLowerCase() ?? "";
    if (!have || have !== want) return false;
  }
  const storeId = conditions.merchant_store_id ?? conditions.store_id;
  if (storeId != null && Number(storeId) !== ctx.merchantStoreId) return false;

  const pincodes = conditions.pincodes;
  if (Array.isArray(pincodes) && pincodes.length > 0) {
    const userPin = (ctx.dropPostalCode ?? "").trim();
    if (!userPin) return false;
    const allowed = pincodes.map((x) => String(x).trim()).filter((x) => x.length > 0);
    if (!allowed.includes(userPin)) return false;
  }
  return true;
}

function sortedOffers(rows: PlatformOfferRow[]): PlatformOfferRow[] {
  return [...rows].sort((a, b) => a.priority - b.priority);
}

type GeoTargetBucket = { level: string; ids: string[] };

function normalizeGeoLevel(l: string): string {
  return l.trim().toLowerCase().replace(/-/g, "_");
}

function geoTargetsFromOffer(o: PlatformOfferRow): GeoTargetBucket[] {
  const cond = (o.conditions ?? {}) as Record<string, unknown>;
  const raw = cond.geo_targets;
  if (Array.isArray(raw)) {
    const buckets: GeoTargetBucket[] = [];
    for (const x of raw) {
      if (!x || typeof x !== "object") continue;
      const level = normalizeGeoLevel(String((x as { level?: unknown }).level ?? ""));
      const idsRaw = (x as { ids?: unknown }).ids;
      const ids = Array.isArray(idsRaw)
        ? idsRaw.map((i) => String(i).trim()).filter((s) => s.length > 0)
        : [];
      if (level && ids.length) buckets.push({ level, ids });
    }
    if (buckets.length > 0) return buckets;
  }
  const gl = o.geoLevel ? normalizeGeoLevel(o.geoLevel) : "";
  if (gl && o.geoIds.length > 0) {
    return [{ level: gl, ids: o.geoIds.map((x) => String(x).trim()).filter((s) => s.length > 0) }];
  }
  return [];
}

export function platformOfferGeoMatches(ctx: BillContext, o: PlatformOfferRow): boolean {
  const scope = (o.targetScope ?? "GLOBAL").toUpperCase();
  if (scope !== "GEO" && scope !== "GEO_MERCHANT") return true;

  const refs = ctx.dropGeoRefByLevel;
  const buckets = geoTargetsFromOffer(o);

  if (buckets.length > 0 && refs) {
    for (const b of buckets) {
      const idAtLevel = refs[b.level as keyof NonNullable<BillContext["dropGeoRefByLevel"]>];
      if (typeof idAtLevel === "string" && b.ids.includes(idAtLevel)) return true;
    }
  }

  const bound = ctx.platformOfferGeoBindingEffectiveIds;
  if (bound.size > 0 && bound.has(o.id)) return true;

  return false;
}

export function platformOfferMerchantScopeMatches(ctx: BillContext, o: PlatformOfferRow): boolean {
  const scope = (o.targetScope ?? "GLOBAL").toUpperCase();
  if (scope === "MERCHANT" || scope === "GEO_MERCHANT") {
    if (o.merchantIds.length === 0) return false;
    return o.merchantIds.includes(ctx.merchantStoreId);
  }
  if (o.merchantIds.length > 0 && !o.merchantIds.includes(ctx.merchantStoreId)) return false;
  return true;
}

function platformOfferMinCartMeetsThreshold(o: PlatformOfferRow, grossCart: number): boolean {
  const minAmt = effectiveMinOrderAmount(o);
  // grossCart is item + add-on subtotal only (eligible item values); fees and taxes excluded.
  if (minAmt > 0 && grossCart < minAmt) return false;
  return true;
}

/** Exported for checkout promo listing (same gates as apply phase, minus budget exhaustion). */
export function platformOfferEligible(ctx: BillContext, o: PlatformOfferRow, grossCart: number): boolean {
  if (!platformOfferMerchantScopeMatches(ctx, o)) return false;
  if (!platformOfferGeoMatches(ctx, o)) return false;
  if (!platformOfferMinCartMeetsThreshold(o, grossCart)) return false;
  const cond = (o.conditions ?? {}) as Record<string, unknown>;
  if (!platformOfferConditionsPass(cond, ctx)) return false;
  return true;
}

function kindUpper(o: PlatformOfferRow): string {
  return String(o.offerKind ?? "DISCOUNT").toUpperCase();
}

const CART_LIKE_KINDS = new Set([
  "DISCOUNT",
  "COUPON",
  "FLAT_DISCOUNT",
  "CASHBACK",
  "BUNDLE_DISCOUNT",
  "LOYALTY_REWARD",
  "FLASH_SALE",
]);

const FEE_KIND_TO_REM_KEY: Record<string, keyof FeeRem> = {
  PACKAGING_DISCOUNT: "packaging",
  SURGE_DISCOUNT: "surge",
  SMALL_ORDER_FEE_OFF: "smallOrder",
  CONVENIENCE_FEE_OFF: "convenience",
};

function menuItemAllowSet(o: PlatformOfferRow): Set<string> | null {
  const cond = (o.conditions ?? {}) as Record<string, unknown>;
  const raw = cond.menu_item_ids ?? cond.menuItemIds;
  if (!Array.isArray(raw) || raw.length === 0) return null;
  return new Set(raw.map((x) => String(x).trim()).filter((s) => s.length > 0));
}

/** Expand order lines into per-unit pieces for buy-X / free-unit math. */
function unitPieces(ctx: BillContext): { menuItemId: string; unitPrice: number }[] {
  const out: { menuItemId: string; unitPrice: number }[] = [];
  for (const line of ctx.orderLines ?? []) {
    const q = Math.max(1, Math.floor(Number(line.quantity) || 1));
    const unit = q > 0 ? line.lineTotal / q : line.lineTotal;
    const id = String(line.menuItemId ?? "").trim();
    for (let i = 0; i < q; i++) out.push({ menuItemId: id, unitPrice: unit });
  }
  return out;
}

function filterUnitsByMenu(
  units: { menuItemId: string; unitPrice: number }[],
  allow: Set<string> | null
): { menuItemId: string; unitPrice: number }[] {
  if (!allow) return units;
  return units.filter((u) => allow.has(u.menuItemId));
}

function sumCheapestUnitPrices(units: { unitPrice: number }[], count: number): number {
  if (count <= 0 || units.length === 0) return 0;
  const sorted = [...units].sort((a, b) => a.unitPrice - b.unitPrice);
  let sum = 0;
  const n = Math.min(count, sorted.length);
  for (let i = 0; i < n; i++) sum += sorted[i].unitPrice;
  return sum;
}

function hasStandardCartDiscount(o: PlatformOfferRow): boolean {
  return (
    (o.discountType === "PERCENTAGE" || o.discountType === "FIXED") && num(o.valueNumeric) > 0
  );
}

/**
 * Estimate the discount (₹) an offer would produce in the current bill state.
 * Used to pick the MAX-value offer when multiple are eligible.
 * Falls back to priority-based 0 for kinds whose value is hard to estimate without
 * the full apply pipeline (BUY_X_GET_Y, FREE_MENU_ITEM, BUNDLE_DISCOUNT, etc.).
 */
export function estimateOfferDiscountValue(o: PlatformOfferRow, ctx: BillContext, rem: FeeRem): number {
  const k = String(o.offerKind ?? "DISCOUNT").toUpperCase();
  const value = num(o.valueNumeric);
  const cap = num(o.maxDiscountAmount);

  // FREE_DELIVERY: based on delivery_discount_type
  if (k === "FREE_DELIVERY") {
    const dd = (o.deliveryDiscountType ?? "").toUpperCase().trim();
    if (dd === "FULL_WAIVE") return Math.max(0, rem.delivery);
    if (dd === "PERCENT") {
      const v = num(o.deliveryDiscountValue);
      if (v <= 0) return 0;
      let amt = (rem.delivery * v) / 100;
      if (cap > 0) amt = Math.min(amt, cap);
      return Math.max(0, Math.min(amt, rem.delivery));
    }
    if (dd === "FIXED") {
      const v = num(o.deliveryDiscountValue);
      if (v <= 0) return 0;
      return Math.min(v, rem.delivery);
    }
    return 0;
  }

  // Fee-bucket offers: applied to a specific fee
  if (FEE_KIND_TO_REM_KEY[k]) {
    const remKey = FEE_KIND_TO_REM_KEY[k];
    const base = Math.max(0, rem[remKey]);
    if (base <= 0 || value <= 0) return 0;
    let amt = o.discountType === "PERCENTAGE" ? (base * value) / 100 : value;
    if (cap > 0) amt = Math.min(amt, cap);
    return Math.max(0, Math.min(amt, base));
  }

  // Cart discounts (DISCOUNT, COUPON, FLAT_DISCOUNT, CASHBACK, etc.)
  if (CART_LIKE_KINDS.has(k) || k === "DISCOUNT") {
    const base = Math.max(0, rem.items);
    if (base <= 0 || value <= 0) return 0;
    let amt = o.discountType === "PERCENTAGE" ? (base * value) / 100 : value;
    if (cap > 0) amt = Math.min(amt, cap);
    return Math.max(0, Math.min(amt, base));
  }

  // Hard-to-simulate kinds (BUY_X_GET_Y, FREE_MENU_ITEM): fall back to value/cap as hint.
  if (cap > 0) return cap;
  if (value > 0) return value;
  return 0;
}

/**
 * Pick the offer that produces the LARGEST discount among eligible candidates.
 * Customer-facing rule: only one platform offer is applied per order, and we apply
 * the most valuable one for the customer. If a user selection (ctx.selectedPlatformOfferId)
 * is set and is eligible + matches the kind filter, we honour that instead of auto-picking.
 */
function pickPlatformOfferWinner(
  ctx: BillContext,
  dataset: BillingDataset,
  grossCart: number,
  kindFilter: (o: PlatformOfferRow) => boolean,
  rem?: FeeRem,
): PlatformOfferRow | null {
  // User explicitly removed the applied offer — skip auto-pick.
  if (ctx.forceNoAutoOffer === true && ctx.selectedPlatformOfferId == null) return null;

  const eligible = listEligiblePlatformOffersForCheckout(ctx, dataset, grossCart).filter(kindFilter);
  if (eligible.length === 0) return null;

  // Honour user's explicit selection when present and eligible
  const selectedId = ctx.selectedPlatformOfferId;
  if (selectedId != null) {
    const picked = eligible.find((o) => o.id === selectedId);
    return picked ?? null; // if selection is no longer eligible, do not silently substitute
  }

  // No user selection — pick the one that yields the highest discount value
  if (rem) {
    let best: PlatformOfferRow | null = null;
    let bestAmt = -1;
    for (const o of eligible) {
      const amt = estimateOfferDiscountValue(o, ctx, rem);
      if (amt > bestAmt) {
        bestAmt = amt;
        best = o;
      }
    }
    if (best) return best;
  }

  // Fallback: priority order (rem unavailable, e.g. listing-only context)
  return eligible[0] ?? null;
}

/** Platform promos that pass geo / merchant / min-cart gates (for checkout UI listing). */
export function listEligiblePlatformOffersForCheckout(
  ctx: BillContext,
  dataset: BillingDataset,
  grossCart: number
): PlatformOfferRow[] {
  const now = new Date();
  const st = ctx.serviceType || "FOOD";
  const offers = sortedOffers(
    dataset.platformOffers.filter(
      (o) => (o.serviceType === st || o.serviceType === "ALL") && isCustomerCheckoutOffer(o)
    )
  );
  const out: PlatformOfferRow[] = [];
  for (const o of offers) {
    if (!nowInWindow(now, o.startsAt, o.endsAt)) continue;
    const cohort = effectiveCustomerSegment(o);
    if ((cohort === "NEW" && ctx.userSegment !== "NEW") || (cohort === "EXISTING" && ctx.userSegment === "NEW"))
      continue;
    if (!platformOfferEligible(ctx, o, grossCart)) continue;
    out.push(o);
  }
  return out;
}

function applyCartDiscountAmount(
  winner: PlatformOfferRow,
  state: MutableBillState,
  rem: FeeRem,
  base: number,
  labelSuffix?: string
): number {
  const pool = Math.max(0, rem.items);
  const share = base > 0 ? Math.min(1, base / pool) : 0;
  const afterDiscBase = pool * share;
  let amt =
    winner.discountType === "PERCENTAGE"
      ? (afterDiscBase * num(winner.valueNumeric)) / 100
      : num(winner.valueNumeric);
  if (num(winner.maxDiscountAmount) > 0) amt = Math.min(amt, num(winner.maxDiscountAmount));
  amt = Math.min(Math.max(0, amt), afterDiscBase, pool);
  if (amt <= 0) return 0;

  rem.items -= amt;
  state.discountTotal += amt;
  const label =
    (winner.name?.trim() || `GatiMitra offer #${winner.id}`) + (labelSuffix ? ` ${labelSuffix}` : "");
  const line: AppliedLine = {
    kind: "discount",
    label,
    amount: amt,
    hidden: winner.isHidden,
    meta: {
      platformOfferId: winner.id,
      fundingMode: winner.fundingMode,
      platformContribution: (amt * winner.platformSharePct) / 100,
      merchantContribution: (amt * winner.merchantSharePct) / 100,
      offerKind: kindUpper(winner),
    },
  };
  state.discounts.push(line);
  state.breakdown_steps.push({ step: line.label, amount: -amt, meta: { platformOfferId: winner.id } });
  return amt;
}

/** Cart-line offers: standard cart %/fixed, BUY_X_GET_Y, FREE_MENU_ITEM, and cart-like kinds. Excludes pure fee kinds and FREE_DELIVERY. */
export function applyPlatformCartOffers(
  ctx: BillContext,
  dataset: BillingDataset,
  state: MutableBillState,
  itemPlusAddon: number,
  rem: FeeRem
): void {
  const grossCart = qualifyingCartFromRem(itemPlusAddon, rem);

  const winner = pickPlatformOfferWinner(ctx, dataset, grossCart, (o) => {
    const k = kindUpper(o);
    if (k === "FREE_DELIVERY") return false;
    if (FEE_KIND_TO_REM_KEY[k]) return false;

    if (k === "SUBSCRIPTION_BENEFIT") {
      if (ctx.subscriptionOptIn !== true) return false;
      return hasStandardCartDiscount(o);
    }

    if (k === "BUY_X_GET_Y") {
      const buyQ = o.buyQty ?? 0;
      const getQ = o.getQty ?? 0;
      if (buyQ < 1 || getQ < 1) return false;
      if (!hasStandardCartDiscount(o)) return false;
      const allow = menuItemAllowSet(o);
      const units = filterUnitsByMenu(unitPieces(ctx), allow);
      if (units.length < buyQ) return false;
      return true;
    }

    if (k === "FREE_MENU_ITEM") {
      const getQ = o.getQty ?? 0;
      if (getQ < 1) return false;
      const allow = menuItemAllowSet(o);
      if (!allow || allow.size === 0) return false;
      const units = filterUnitsByMenu(unitPieces(ctx), allow);
      return units.length >= getQ;
    }

    if (CART_LIKE_KINDS.has(k)) return hasStandardCartDiscount(o);

    return hasStandardCartDiscount(o);
  }, rem);

  if (!winner) return;

  const k = kindUpper(winner);

  if (k === "BUY_X_GET_Y") {
    const getQ = winner.getQty ?? 0;
    const allow = menuItemAllowSet(winner);
    const units = filterUnitsByMenu(unitPieces(ctx), allow);
    const base = sumCheapestUnitPrices(units, getQ);
    applyCartDiscountAmount(winner, state, rem, base, "(buy X get Y)");
    return;
  }

  if (k === "FREE_MENU_ITEM") {
    const getQ = winner.getQty ?? 0;
    const allow = menuItemAllowSet(winner)!;
    const units = filterUnitsByMenu(unitPieces(ctx), allow);
    const base = sumCheapestUnitPrices(units, getQ);
    const pool = Math.max(0, rem.items);
    const share = base > 0 ? Math.min(1, base / pool) : 0;
    const afterDiscBase = pool * share;
    const amt = Math.min(Math.max(0, afterDiscBase), pool);
    if (amt <= 0) return;
    rem.items -= amt;
    state.discountTotal += amt;
    const label = winner.name?.trim() || `Free menu item · #${winner.id}`;
    const line: AppliedLine = {
      kind: "discount",
      label,
      amount: amt,
      hidden: winner.isHidden,
      meta: {
        platformOfferId: winner.id,
        fundingMode: winner.fundingMode,
        offerKind: k,
        freeMenuUnits: getQ,
      },
    };
    state.discounts.push(line);
    state.breakdown_steps.push({ step: label, amount: -amt, meta: { platformOfferId: winner.id } });
    return;
  }

  const baseAfterDisc = Math.max(0, rem.items);
  applyCartDiscountAmount(winner, state, rem, baseAfterDisc);
}

/** Delivery: FREE_DELIVERY kind or any offer with a delivery adjustment type. */
export function applyPlatformDeliveryOffers(
  ctx: BillContext,
  dataset: BillingDataset,
  state: MutableBillState,
  itemPlusAddon: number,
  rem: FeeRem
): void {
  const grossCart = qualifyingCartFromRem(itemPlusAddon, rem);

  const winner = pickPlatformOfferWinner(ctx, dataset, grossCart, (o) => {
    const k = kindUpper(o);
    const dd = (o.deliveryDiscountType ?? "").toUpperCase().trim();
    if (k === "FREE_DELIVERY") return Boolean(dd);
    return Boolean(dd);
  }, rem);

  if (!winner) return;
  const dd = (winner.deliveryDiscountType ?? "").toUpperCase().trim();
  let cut = 0;
  if (dd === "FULL_WAIVE" && rem.delivery > 0) {
    cut = rem.delivery;
    rem.delivery = 0;
  } else if (dd === "PERCENT" && rem.delivery > 0 && num(winner.deliveryDiscountValue) > 0) {
    cut = (rem.delivery * num(winner.deliveryDiscountValue)) / 100;
    rem.delivery = Math.max(0, rem.delivery - cut);
  } else if (dd === "FIXED" && rem.delivery > 0 && num(winner.deliveryDiscountValue) > 0) {
    cut = Math.min(rem.delivery, num(winner.deliveryDiscountValue));
    rem.delivery -= cut;
  }
  if (cut <= 0) return;
  state.breakdown_steps.push({
    step: winner.name?.trim() ? `Delivery discount · ${winner.name}` : `Delivery discount (#${winner.id})`,
    amount: -cut,
    meta: {
      platformOfferId: winner.id,
      fundingMode: winner.fundingMode,
      platformContribution: (cut * winner.platformSharePct) / 100,
      merchantContribution: (cut * winner.merchantSharePct) / 100,
      offerKind: kindUpper(winner),
    },
  });
}

/** Fee-bucket platform offers (packaging, surge, small order, convenience). Runs after delivery is priced. */
export function applyPlatformFeeBucketOffers(
  ctx: BillContext,
  dataset: BillingDataset,
  state: MutableBillState,
  itemPlusAddon: number,
  rem: FeeRem
): void {
  const grossCart = qualifyingCartFromRem(itemPlusAddon, rem);

  const winner = pickPlatformOfferWinner(ctx, dataset, grossCart, (o) => {
    const k = kindUpper(o);
    const remKey = FEE_KIND_TO_REM_KEY[k];
    if (!remKey) return false;
    return hasStandardCartDiscount(o);
  }, rem);

  if (!winner) return;
  const k = kindUpper(winner);
  const remKey = FEE_KIND_TO_REM_KEY[k];
  if (!remKey) return;

  let base = Math.max(0, rem[remKey]);
  if (base <= 0) return;

  let cut =
    winner.discountType === "PERCENTAGE"
      ? (base * num(winner.valueNumeric)) / 100
      : num(winner.valueNumeric);
  if (num(winner.maxDiscountAmount) > 0) cut = Math.min(cut, num(winner.maxDiscountAmount));
  cut = Math.min(Math.max(0, cut), base);
  if (cut <= 0) return;

  rem[remKey] = Math.max(0, rem[remKey] - cut);
  state.discountTotal += cut;

  const label =
    winner.name?.trim() || `Platform fee discount · ${k.replace(/_/g, " ")} (#${winner.id})`;
  const line: AppliedLine = {
    kind: "discount",
    label,
    amount: cut,
    hidden: winner.isHidden,
    meta: {
      platformOfferId: winner.id,
      fundingMode: winner.fundingMode,
      offerKind: k,
      feeBucket: remKey,
    },
  };
  state.discounts.push(line);
  state.breakdown_steps.push({
    step: label,
    amount: -cut,
    meta: { platformOfferId: winner.id, feeBucket: remKey },
  });
}
