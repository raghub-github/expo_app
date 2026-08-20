/**
 * Freeze Merchant CTM line pricing at order placement.
 *
 * Engine origin: MCRDP / allset (`a4af39e1`).
 *
 *   gross_value              = catalog selling price (menu ₹, before commission)
 *   net_ctm_value            = discounted MX after store offer (no commission scaling)
 *                              BOGO does not reduce net (discount stored as 0)
 *   merchant_offer_type      = PERCENTAGE | FLAT | BOGO | NONE  (legacy BOOST still valid)
 *   merchant_offer_name      = actual store offer title
 *   merchant_offer_discount  = store-offer ₹ on MX CTM (not the percent)
 *
 * v1: gross_value = customer catalog; net = catalog − store offer; settlement × (100−pct)/100.
 * v2: billing order_line_pricing.canonical_pricing is SSOT (gross = original MX; net = discounted MX).
 */

import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { sql } from "drizzle-orm";
import {
  merchantFundedDiscountFromBilling,
  cartSurfaceMerchantDiscountFromBilling,
  isCartSurfaceDiscountRow,
} from "../../lib/merchant-billing-discount.js";
import type { ResolvedCommission } from "./commission.resolver.js";
import {
  ITEM_PRICING_CALCULATION_VERSION,
  isStoreFundedItemOfferType,
  parseCanonicalPricing,
  type ItemPricingResult,
} from "../pricing/canonicalItemPricing.js";

function num(v: unknown): number {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  const n = parseFloat(String(v ?? "0"));
  return Number.isFinite(n) ? n : 0;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Whole-rupee merchant display (matches menu / merchant UI). */
function merchantRupee(n: number): number {
  return Math.round(Number.isFinite(n) ? n : 0);
}

/**
 * Any "buy N get M" / free-unit deal collapses to the canonical BOGO tag. Kept broad on
 * purpose: a BOGO offer must be recognised no matter how the merchant row spelled its type
 * (BOGO, BUY_X_GET_Y, BUY_N_GET_M, BUY_ONE_GET_ONE, BOGO_50, "Buy 2 Get 1", …) so it can
 * never fall through and be mislabelled as a Boost in CTM.
 */
function isRawBogoOfferType(t: string): boolean {
  if (!t) return false;
  if (t === "BOGO" || t === "BUY_X_GET_Y" || t === "BUY_N_GET_M") return true;
  if (t.startsWith("BOGO")) return true;
  return t.includes("BUY") && t.includes("GET");
}

function normalizeOfferType(raw: unknown): string {
  const t = String(raw ?? "").trim().toUpperCase().replace(/[-\s]+/g, "_");
  if (!t) return "NONE";
  if (isRawBogoOfferType(t)) return "BOGO";
  if (t === "BUNDLE") return "COMBO";
  if (t === "CART_PERCENTAGE") return "PERCENTAGE";
  if (t === "CART_FLAT") return "FLAT";
  if (t === "BOOST") return "BOOST";
  return t;
}

function isBogoOfferType(t: string): boolean {
  return isRawBogoOfferType(t);
}

/**
 * Safety net for the "BOGO stored as BOOST" bug: the billing engine already stamps the
 * canonical "Buy One Get One" label on every targeted BOGO line (merchantOffersApply). If a
 * line's raw offer TYPE ever arrives spelled as a bare %/flat (e.g. a legacy/mis-stamped row)
 * but its finalized NAME is a buy-get deal, it is still a BOGO and must never be laundered
 * into a Boost. This reads the finalized billing label only — it never re-infers eligibility.
 */
function labelLooksBogo(name: string | null | undefined): boolean {
  const s = String(name ?? "").toLowerCase();
  if (!s) return false;
  if (/\bbogo\b/.test(s)) return true;
  return /buy\s*(\d+|one|two|three|four|five|six|seven|eight|nine|ten)\s*get/i.test(s);
}

function isBoostOfferType(t: string): boolean {
  return t === "BOOST";
}

function isItemPercentOrFlatType(t: string): boolean {
  return t === "PERCENTAGE" || t === "FLAT" || t === "BOOST";
}

/** Persist the actual store-offer type. Do not collapse PERCENTAGE/FLAT into BOOST. */
function persistStoreItemOfferType(raw: string): "PERCENTAGE" | "FLAT" | "BOOST" {
  const t = String(raw ?? "").trim().toUpperCase().replace(/[-\s]+/g, "_");
  if (t === "FLAT") return "FLAT";
  if (t === "BOOST") return "BOOST";
  return "PERCENTAGE";
}

function isStoreFundedPersistType(t: string): boolean {
  return t === "PERCENTAGE" || t === "FLAT" || t === "BOOST";
}

/**
 * Merchant Precision (cart-level) must never enter merchant_ctm_pricing_snapshot — it
 * lives only in orders_core.merchant_precision_discount. Must check the RAW type
 * (before normalizeOfferType, which collapses CART_PERCENTAGE/CART_FLAT into
 * PERCENTAGE/FLAT and would otherwise make a cart-level line indistinguishable from a
 * genuine item-surface Boost).
 */
function isCartSurfaceOfferTypeRaw(raw: unknown): boolean {
  const t = String(raw ?? "").trim().toUpperCase().replace(/[-\s]+/g, "_");
  return t === "PRECISION" || t === "CART_PERCENTAGE" || t === "CART_FLAT";
}

/** Canonical merchant-facing offer name frozen into CTM. */
function canonicalCtmOfferName(args: {
  offerType: string;
  offerName: string | null;
  offerDiscountPct?: number | null;
  offerDiscountFlat?: number | null;
}): string | null {
  const { offerType, offerName, offerDiscountPct, offerDiscountFlat } = args;
  if (isBogoOfferType(offerType)) {
    const raw = (offerName ?? "").trim();
    const m = raw.match(/buy\s*(\d+|one|two|three|four|five|six|seven|eight|nine|ten)\s*get\s*(\d+|one|two|three|four|five|six|seven|eight|nine|ten)/i);
    if (m) {
      const toNum = (s: string): number => {
        const map: Record<string, number> = {
          one: 1,
          two: 2,
          three: 3,
          four: 4,
          five: 5,
          six: 6,
          seven: 7,
          eight: 8,
          nine: 9,
          ten: 10,
        };
        const key = s.toLowerCase();
        if (map[key] != null) return map[key]!;
        const n = Number(s);
        return Number.isFinite(n) && n > 0 ? Math.round(n) : 1;
      };
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
        return w[n] ?? String(n);
      };
      return `Buy ${word(toNum(m[1]!))} Get ${word(toNum(m[2]!))}`;
    }
    if (/buy\s*one\s*get\s*one/i.test(raw)) return "Buy One Get One";
    return raw || "Buy One Get One";
  }
  if (isBoostOfferType(offerType) || offerType === "PERCENTAGE" || offerType === "FLAT") {
    return (offerName ?? "").trim() || "Store Offer Applied";
  }
  if (offerType === "PRECISION" || offerType === "CART_PERCENTAGE" || offerType === "CART_FLAT") {
    return (offerName ?? "").trim() || "Precision Offer Applied";
  }
  const raw = (offerName ?? "").trim();
  return raw || null;
}

export type MerchantCtmLineInput = {
  orderItemId: number;
  menuItemId: number | null;
  quantity: number;
  /** Customer-visible catalog line (base×qty + addons) before store offers. */
  customerCatalogLine: number;
  /** Customer-visible merchant-funded offer discount on this line (from order_line_pricing). */
  customerOfferDiscount: number;
  offerType: string | null;
  offerName: string | null;
  /**
   * The merchant offer id the billing engine attributed to this line (order_line_pricing.appliedOfferId).
   * SSOT for the line's offer SURFACE: the mapper looks this id up in the finalized discounts[]
   * metadata to decide item-surface (Boost/BOGO) vs cart-surface (Precision). A cart/precision
   * offer stamped onto a line as appliedOfferType "PERCENTAGE" must NEVER become a Boost.
   */
  appliedOfferId?: number | null;
  /** Merchant-configured Boost % from the offer row (authoritative). */
  offerDiscountPct: number | null;
  /** Merchant-configured flat ₹ from the offer row. */
  offerDiscountFlat: number | null;
  /**
   * Billing engine's per-line ITEM_PROMO flag (from order_line_pricing.ineligibilityReason).
   * SSOT for "this line carries a merchant ITEM offer": only ITEM_PROMO lines may become a
   * Boost in CTM. Undefined = signal not available (falls back to order_line_eligibility).
   */
  isItemPromo?: boolean;
  /** v2 canonical item pricing frozen on the cart/order line. */
  canonicalPricing?: ItemPricingResult | null;
};

/** Billing order_line_pricing.canonical_pricing is the CTM v2 SSOT — do not reverse-scale catalog. */
function canonicalPricingFromBillingRow(
  row: Record<string, unknown> | null | undefined
): ItemPricingResult | null {
  if (!row) return null;
  return parseCanonicalPricing(row.canonical_pricing ?? row.canonicalPricing);
}

/**
 * Read the billing engine's per-line ITEM_PROMO flag off the matched order_line_pricing row.
 * Returns undefined when there is no pricing row (so callers can fall back to the separate,
 * index-based order_line_eligibility array). This is the SSOT for whether a line carries a
 * merchant ITEM offer — item-surface offers only ever apply to ITEM_PROMO lines.
 */
function itemPromoFromPricingRow(
  row: Record<string, unknown> | null | undefined
): boolean | undefined {
  if (!row) return undefined;
  const reason = String(row.ineligibilityReason ?? row.ineligibility_reason ?? "")
    .trim()
    .toUpperCase();
  return reason === "ITEM_PROMO";
}

/**
 * Assign each cart line its OWN order_line_pricing row, 1:1, so no two lines ever share a row.
 *
 * A plain `rows.find(r => r.menuItemId === mid)` returns the FIRST row matching a menu id, with no
 * memory that a previous line already claimed it. In a mixed cart where two lines carry the same
 * menuItemId (the same dish on separate lines) — or when order_line_pricing's length/order drifts
 * from the cart — that makes multiple lines read the SAME row, leaking one item's offer metadata
 * (e.g. a BOGO) onto another item's CTM snapshot. Consuming each row at most once keeps every line
 * independent: positional match first (the arrays are normally in cart order), then the next
 * UNCLAIMED row with the same menu id, then an unclaimed positional row only when ids are absent.
 */
function assignPricingRowsToItems(
  billing: Record<string, unknown> | null | undefined,
  menuIds: string[]
): Array<Record<string, unknown> | null> {
  const n = menuIds.length;
  const result: Array<Record<string, unknown> | null> = new Array(n).fill(null);
  if (!billing) return result;
  const raw =
    (Array.isArray(billing.order_line_pricing) && billing.order_line_pricing) ||
    (Array.isArray(billing.orderLinePricing) && billing.orderLinePricing) ||
    [];
  const rows = raw as Array<Record<string, unknown>>;
  if (rows.length === 0) return result;
  const rowMid = (r: Record<string, unknown> | undefined): string =>
    r ? String(r.menuItemId ?? r.menu_item_id ?? "").trim() : "";
  const consumed = new Set<number>();

  // Pass 1: positional — rows[i] belongs to line i when their menu ids agree.
  for (let i = 0; i < n; i++) {
    const mid = String(menuIds[i] ?? "").trim();
    const r = rows[i];
    if (r && !consumed.has(i) && mid && rowMid(r) === mid) {
      result[i] = r;
      consumed.add(i);
    }
  }
  // Pass 2: for still-unassigned lines, take the next UNCLAIMED row with a matching menu id.
  for (let i = 0; i < n; i++) {
    if (result[i]) continue;
    const mid = String(menuIds[i] ?? "").trim();
    if (!mid) continue;
    for (let j = 0; j < rows.length; j++) {
      if (consumed.has(j)) continue;
      if (rowMid(rows[j]) === mid) {
        result[i] = rows[j]!;
        consumed.add(j);
        break;
      }
    }
  }
  // Pass 3: last resort — an unclaimed positional row when a menu id is absent on either side
  // (legacy bills). Never steal a row already positively id-matched to another line.
  for (let i = 0; i < n; i++) {
    if (result[i]) continue;
    const r = rows[i];
    if (r && !consumed.has(i) && (!rowMid(r) || !String(menuIds[i] ?? "").trim())) {
      result[i] = r;
      consumed.add(i);
    }
  }
  return result;
}

/** Build CTM line inputs from placement cart + billing snapshot. */
export function buildMerchantCtmLineInputs(args: {
  insertedItemIds: number[];
  items: Array<{
    menuItemId: number | string;
    quantity: number;
    basePrice: number;
    addons: Array<{ addonPrice: number; quantity: number }>;
    itemSnapshot?: Record<string, unknown> | null;
  }>;
  billingSnapshot: Record<string, unknown> | null | undefined;
}): MerchantCtmLineInput[] {
  const { insertedItemIds, items, billingSnapshot } = args;
  const out: MerchantCtmLineInput[] = [];
  // Resolve one distinct order_line_pricing row per cart line up front (1:1, no row reused) so a
  // mixed cart can never leak one item's offer onto another's snapshot row.
  const pricingByLine = assignPricingRowsToItems(
    billingSnapshot,
    items.map((it) => String(it.menuItemId))
  );
  for (let i = 0; i < items.length; i++) {
    const orderItemId = insertedItemIds[i];
    if (orderItemId == null || !Number.isFinite(orderItemId) || orderItemId <= 0) continue;
    const it = items[i]!;
    const addonPerUnit = (it.addons ?? []).reduce(
      (a, ad) => a + Number(ad.addonPrice || 0) * Math.max(1, Number(ad.quantity) || 1),
      0
    );
    const qty = Math.max(1, Number(it.quantity) || 1);
    const customerCatalog = round2(Number(it.basePrice) * qty + addonPerUnit * qty);
    const row = pricingByLine[i];
    const catalogFromSnap = row
      ? num(row.catalogLineTotal ?? row.catalog_line_total)
      : 0;
    const customerCatalogLine =
      catalogFromSnap > 0.005 ? round2(catalogFromSnap) : customerCatalog;
    const customerOfferDiscount = row
      ? Math.max(0, round2(num(row.offerDiscountAmount ?? row.offer_discount_amount)))
      : 0;
    const offerType = row
      ? String(row.appliedOfferType ?? row.applied_offer_type ?? "").trim() || null
      : null;
    const offerName = row
      ? String(row.appliedOfferLabel ?? row.applied_offer_label ?? "").trim() || null
      : null;
    const pctRaw = row
      ? num(row.appliedOfferDiscountPct ?? row.applied_offer_discount_pct)
      : 0;
    const flatRaw = row
      ? num(row.appliedOfferDiscountFlat ?? row.applied_offer_discount_flat)
      : 0;
    const appliedOfferIdRaw = row
      ? Number(row.appliedOfferId ?? row.applied_offer_id)
      : NaN;
    const menuId = Number(it.menuItemId);
    out.push({
      orderItemId: Number(orderItemId),
      menuItemId: Number.isFinite(menuId) && menuId > 0 ? menuId : null,
      quantity: qty,
      customerCatalogLine: customerCatalogLine > 0.005 ? customerCatalogLine : Math.max(0, customerCatalog),
      customerOfferDiscount,
      offerType,
      offerName,
      appliedOfferId:
        Number.isFinite(appliedOfferIdRaw) && appliedOfferIdRaw > 0 ? appliedOfferIdRaw : null,
      offerDiscountPct: pctRaw > 0 && pctRaw <= 100 ? pctRaw : null,
      offerDiscountFlat: flatRaw > 0 ? flatRaw : null,
      isItemPromo: itemPromoFromPricingRow(row),
      canonicalPricing: parseCanonicalPricing(
        row?.canonical_pricing ??
          row?.canonicalPricing ??
          (it as { itemSnapshot?: Record<string, unknown> }).itemSnapshot?.canonical_pricing
      ),
    });
  }
  return out;
}

/**
 * A single order line's OWN finalized offer economics, exactly as frozen on its
 * `orders_core_items` row at placement. This is the leak-proof SSOT for CTM: every field
 * belongs to one specific order item and is never matched, inferred, or borrowed from
 * another line or from a shared billing array.
 */
export type FrozenOrderItemForCtm = {
  orderItemId: number;
  menuItemId: number | null;
  quantity: number;
  /** orders_core_items.total_price — customer catalog line (base×qty + addons), before offers. */
  catalogLineTotal: number;
  /** orders_core_items.offer_discount_amount — merchant-funded item discount on THIS line (customer ₹). */
  offerDiscountAmount: number;
  /** orders_core_items.applied_offer_type — this line's own finalized merchant offer type. */
  appliedOfferType: string | null;
  /** orders_core_items.applied_offer_label — this line's own finalized offer name. */
  appliedOfferLabel: string | null;
  /** orders_core_items.applied_offer_id — the merchant offer id the billing engine attributed here. */
  appliedOfferId: number | null;
  /** orders_core_items.ineligibility_reason === 'ITEM_PROMO' — SSOT gate for a merchant ITEM offer. */
  isItemPromo: boolean | undefined;
  itemSnapshot?: Record<string, unknown> | null;
};

/**
 * Build ONE CTM line input from ONE order line's OWN frozen fields.
 *
 * Every value comes from the single `orders_core_items` row for this exact order item — the
 * same per-line SSOT the merchant/partner surfaces read. Nothing is matched against, inferred
 * from, or borrowed out of another line or a shared billing array, so one item's offer can
 * never contaminate another item's snapshot. This is the ONLY builder placement/backfill use;
 * `prepareCtmRows` then classifies each line independently (BOGO / BOOST / NONE).
 */
export function ctmLineInputFromFrozenItem(row: FrozenOrderItemForCtm): MerchantCtmLineInput {
  const menuId = row.menuItemId != null ? Number(row.menuItemId) : NaN;
  const offerId = row.appliedOfferId != null ? Number(row.appliedOfferId) : NaN;
  return {
    orderItemId: Number(row.orderItemId),
    menuItemId: Number.isFinite(menuId) && menuId > 0 ? menuId : null,
    quantity: Math.max(1, Number(row.quantity) || 1),
    customerCatalogLine: Math.max(0, round2(num(row.catalogLineTotal))),
    customerOfferDiscount: Math.max(0, round2(num(row.offerDiscountAmount))),
    offerType: String(row.appliedOfferType ?? "").trim() || null,
    offerName: String(row.appliedOfferLabel ?? "").trim() || null,
    appliedOfferId: Number.isFinite(offerId) && offerId > 0 ? offerId : null,
    // pct/flat aren't frozen per item; prepareCtmRows fills a Boost's pct from the offer's
    // discounts[] meta when needed. Never required for correct type/discount/net.
    offerDiscountPct: null,
    offerDiscountFlat: null,
    isItemPromo: row.isItemPromo,
    canonicalPricing: parseCanonicalPricing(
      row.itemSnapshot?.canonical_pricing ?? row.itemSnapshot?.canonicalPricing
    ),
  };
}

/**
 * The billing pricing row that belongs to ONE line, resolved strictly per line: the row at
 * this line's own index (arrays are normally in cart order), else the row whose menu id equals
 * this line's own menu id. Mirrors how orders_core_items was frozen (positional-first). Used
 * ONLY as a legacy fallback for rows that never persisted their own applied_offer_* columns.
 */
function positionalPricingRow(
  rows: Array<Record<string, unknown>>,
  menuItemId: number | null,
  index: number
): Record<string, unknown> | null {
  if (!Array.isArray(rows) || rows.length === 0) return null;
  const mid = menuItemId != null ? String(menuItemId).trim() : "";
  const rowMid = (r: Record<string, unknown> | undefined): string =>
    r ? String(r.menuItemId ?? r.menu_item_id ?? "").trim() : "";
  const byIndex = rows[index];
  if (byIndex) {
    const rmid = rowMid(byIndex);
    if (!mid || !rmid || rmid === mid) return byIndex;
  }
  if (mid) {
    const byId = rows.find((r) => rowMid(r) === mid);
    if (byId) return byId;
  }
  return byIndex ?? null;
}

/** Map a whole order's frozen item rows to CTM line inputs, 1:1, each fully independent. */
export function buildCtmLineInputsFromFrozenItems(
  rows: FrozenOrderItemForCtm[]
): MerchantCtmLineInput[] {
  const out: MerchantCtmLineInput[] = [];
  for (const row of rows) {
    const id = Number(row.orderItemId);
    if (!Number.isFinite(id) || id <= 0) continue;
    out.push(ctmLineInputFromFrozenItem(row));
  }
  return out;
}

/** One orders_core_items row as read by the backfill, plus whether the schema exposes the offer meta cols. */
export type BackfillOrderItemRow = {
  orderItemId: number;
  menuItemId: number | null;
  quantity: number;
  catalogLineTotal: number;
  /** orders_core_items.applied_offer_type (may be null on a bare-insert placement path). */
  ownOfferType: string | null;
  ownOfferLabel: string | null;
  ownOfferId: number | null;
  ownOfferDiscount: number;
  /** orders_core_items.ineligibility_reason; undefined if the column isn't in this schema. */
  ownIneligibilityReason: string | null | undefined;
  itemSnapshot?: Record<string, unknown> | null;
};

/**
 * Resolve ONE backfill line's CTM input deterministically, from a single source of truth:
 *
 *  1. If the order line FROZE its own offer (applied_offer_type or a discount present) → project
 *     those columns verbatim. Leak-proof, 1:1, never re-inferred.
 *  2. Otherwise the line's offer columns are empty (an order-placement path inserted the row
 *     without freezing them). RECOVER this line's offer from the finalized Billing Engine snapshot
 *     — the row at this line's own index, else the row matching this line's own menu id. Strictly
 *     per line; never pooled across items.
 *
 * This is the guarantee the issue demands: a Billing-Engine-identified BOGO can NEVER be persisted
 * as NONE just because one insert path skipped the freeze — every path's persisted CTM is derived
 * from the same billing snapshot. It never defaults to NONE while the billing line carries an offer.
 */
export function resolveBackfillCtmLineInput(
  row: BackfillOrderItemRow,
  pricingRows: Array<Record<string, unknown>>,
  lineIndex: number
): MerchantCtmLineInput {
  const ownType = String(row.ownOfferType ?? "").trim();
  const ownDisc = Math.max(0, round2(num(row.ownOfferDiscount)));
  const rowFrozeOffer = ownType !== "" || ownDisc > 0.005;

  if (rowFrozeOffer) {
    return ctmLineInputFromFrozenItem({
      orderItemId: row.orderItemId,
      menuItemId: row.menuItemId,
      quantity: row.quantity,
      catalogLineTotal: row.catalogLineTotal,
      offerDiscountAmount: ownDisc,
      appliedOfferType: row.ownOfferType ?? null,
      appliedOfferLabel: row.ownOfferLabel ?? null,
      appliedOfferId: row.ownOfferId,
      isItemPromo:
        row.ownIneligibilityReason === undefined
          ? undefined
          : String(row.ownIneligibilityReason ?? "").trim().toUpperCase() === "ITEM_PROMO",
      itemSnapshot: row.itemSnapshot ?? null,
    });
  }

  // Recovery: the line's own columns are empty — read its own row from the billing snapshot.
  const pricing = positionalPricingRow(pricingRows, row.menuItemId, lineIndex);
  const recoveredDisc = pricing
    ? Math.max(0, round2(num(pricing.offerDiscountAmount ?? pricing.offer_discount_amount)))
    : ownDisc;
  const recoveredOfferId = Number(pricing?.appliedOfferId ?? pricing?.applied_offer_id);
  const recoveredSnap =
    row.itemSnapshot ??
    (pricing
      ? {
          canonical_pricing: pricing.canonical_pricing ?? pricing.canonicalPricing ?? null,
        }
      : null);
  return ctmLineInputFromFrozenItem({
    orderItemId: row.orderItemId,
    menuItemId: row.menuItemId,
    quantity: row.quantity,
    catalogLineTotal: row.catalogLineTotal,
    offerDiscountAmount: recoveredDisc,
    appliedOfferType:
      String(pricing?.appliedOfferType ?? pricing?.applied_offer_type ?? row.ownOfferType ?? "").trim() || null,
    appliedOfferLabel:
      String(pricing?.appliedOfferLabel ?? pricing?.applied_offer_label ?? row.ownOfferLabel ?? "").trim() || null,
    appliedOfferId: Number.isFinite(recoveredOfferId) && recoveredOfferId > 0 ? recoveredOfferId : null,
    isItemPromo: itemPromoFromPricingRow(pricing),
    itemSnapshot: recoveredSnap,
  });
}

/** Exported for tests — CTM rows must never carry Merchant Precision (cart-level) $. */
export function prepareCtmRows(
  lines: MerchantCtmLineInput[],
  commissionPercent: number,
  billingSnapshot: Record<string, unknown> | null | undefined
): {
  rows: Array<{
    orderItemId: number;
    menuItemId: number | null;
    quantity: number;
    customerCatalogLine: number;
    customerOfferDiscount: number;
    gross: number;
    disc: number;
    net: number;
    offerType: string;
    offerName: string | null;
    calculationVersion?: number;
    canonicalPricing?: ItemPricingResult | null;
  }>;
  /**
   * Merchant Precision total in COMMISSION-SCALED (merchant-rupee) terms — used ONLY by
   * settlement math. CTM `gross_value` is catalog selling ₹; `net_ctm_value` is
   * selling minus BOOST. Commission is applied in settlement, not in these columns.
   * Never write this to orders_core.merchant_precision_discount.
   */
  cartPrecisionMerchant: number;
  /**
   * Merchant Precision total in CUSTOMER ₹ — the exact value the Billing Engine finalized and
   * the customer sees in the billing breakdown. THIS is what orders_core.merchant_precision_discount
   * must store verbatim (never the commission-scaled figure).
   */
  cartPrecisionCustomer: number;
} {
  const pct = commissionPercent;
  const factor =
    Number.isFinite(pct) && pct >= 0 && pct < 100 ? (100 - pct) / 100 : 1;

  // Per-offer SURFACE resolved from the finalized discounts[] metadata (the SSOT the billing
  // engine already produced). A merchant offer id that funded a CART / PRECISION discount can
  // never make its lines an item offer (Boost/BOGO) in CTM — that ₹ lives only in
  // orders_core.merchant_precision_discount. This is what stops a Precision "Flat 20% Off"
  // (stamped onto lines as appliedOfferType "PERCENTAGE" + ITEM_PROMO) from being mislabelled
  // BOOST. We consult the offer's real surface here, never re-infer it from the line's raw type.
  const cartSurfaceOfferIds = new Set<number>();
  {
    const discRows = Array.isArray(billingSnapshot?.discounts)
      ? (billingSnapshot!.discounts as unknown[])
      : [];
    for (const d of discRows) {
      if (!d || typeof d !== "object") continue;
      const row = d as Record<string, unknown>;
      const meta =
        row.meta && typeof row.meta === "object"
          ? (row.meta as Record<string, unknown>)
          : {};
      const offerId = Number(meta.merchantOfferId ?? meta.merchant_offer_id);
      if (!Number.isFinite(offerId) || offerId <= 0) continue;
      // A platform offer/coupon attributed to a merchant offer id, or any cart/precision merchant
      // offer, is non-item — its lines must never become a Boost.
      if (
        (meta.platformOfferId != null && String(meta.platformOfferId).trim() !== "") ||
        isCartSurfaceDiscountRow(row)
      ) {
        cartSurfaceOfferIds.add(offerId);
      }
    }
  }

  const pricingAssigned = assignPricingRowsToItems(
    billingSnapshot,
    lines.map((l) => (l.menuItemId != null ? String(l.menuItemId) : ""))
  );

  const prepared = lines.map((line, idx) => {
    const pricing = pricingAssigned[idx];
    const mergedTypeRaw =
      String(line.offerType ?? "").trim() ||
      String(pricing?.appliedOfferType ?? pricing?.applied_offer_type ?? "").trim() ||
      null;
    const mergedName =
      String(line.offerName ?? "").trim() ||
      String(pricing?.appliedOfferLabel ?? pricing?.applied_offer_label ?? "").trim() ||
      null;
    const pricingDisc = pricing
      ? Math.max(0, round2(num(pricing.offerDiscountAmount ?? pricing.offer_discount_amount)))
      : 0;
    const mergedDisc =
      line.customerOfferDiscount > 0.005 ? round2(line.customerOfferDiscount) : pricingDisc;
    const mergedOfferIdRaw = Number(
      line.appliedOfferId ?? pricing?.appliedOfferId ?? pricing?.applied_offer_id
    );
    const mergedOfferId =
      Number.isFinite(mergedOfferIdRaw) && mergedOfferIdRaw > 0 ? mergedOfferIdRaw : null;
    const mergedPromo = line.isItemPromo ?? itemPromoFromPricingRow(pricing);

    const appliedOfferIsCart =
      mergedOfferId != null && cartSurfaceOfferIds.has(mergedOfferId);
    const isCartLine = isCartSurfaceOfferTypeRaw(mergedTypeRaw) || appliedOfferIsCart;
    const selling = Math.max(0, round2(line.customerCatalogLine));
    const customerDisc = isCartLine ? 0 : Math.max(0, round2(mergedDisc));
    const pricingPct = pricing
      ? num(pricing.appliedOfferDiscountPct ?? pricing.applied_offer_discount_pct)
      : 0;
    const pricingFlat = pricing
      ? num(pricing.appliedOfferDiscountFlat ?? pricing.applied_offer_discount_flat)
      : 0;
    // gross_value = catalog selling price (before commission).
    const gross = selling;
    return {
      orderItemId: line.orderItemId,
      menuItemId: line.menuItemId,
      quantity: line.quantity,
      selling,
      gross,
      disc: Math.min(selling, customerDisc),
      offerType: isCartLine ? "NONE" : normalizeOfferType(mergedTypeRaw),
      offerName: isCartLine ? null : mergedName,
      offerDiscountPct: isCartLine
        ? null
        : line.offerDiscountPct ?? (pricingPct > 0 && pricingPct <= 100 ? pricingPct : null),
      offerDiscountFlat: isCartLine
        ? null
        : line.offerDiscountFlat ?? (pricingFlat > 0 ? pricingFlat : null),
      isItemPromo: isCartLine ? false : mergedPromo,
      // Billing canonical_pricing wins over a frozen item_snapshot that never received it.
      canonicalPricing: isCartLine
        ? null
        : canonicalPricingFromBillingRow(pricing) ?? line.canonicalPricing ?? null,
    };
  });

  // Prefer per-line order_line_pricing; backfill from merchant-funded discounts[] when missing.
  const discountRows = Array.isArray(billingSnapshot?.discounts)
    ? (billingSnapshot!.discounts as unknown[])
    : [];
  const merchantDiscRows: Array<{
    amount: number;
    label: string;
    offerType: string;
    itemSurface: boolean;
    discountPercentage: number | null;
    discountValue: number | null;
  }> = [];
  for (const d of discountRows) {
    if (!d || typeof d !== "object") continue;
    const row = d as Record<string, unknown>;
    const meta =
      row.meta && typeof row.meta === "object"
        ? (row.meta as Record<string, unknown>)
        : {};
    // Platform checkout offers/coupons never enter Merchant CTM discount pools.
    if (meta.platformOfferId != null && String(meta.platformOfferId).trim() !== "") {
      continue;
    }
    const source = String(row.offerSource ?? row.offer_source ?? meta.source ?? "")
      .toUpperCase()
      .replace(/[-\s]+/g, "_");
    if (source === "PLATFORM" || source === "PLATFORM_OFFERS") continue;

    const amt = merchantFundedDiscountFromBilling({ discounts: [row] });
    if (amt <= 0.005) continue;
    const ot = normalizeOfferType(meta.offerType ?? meta.offer_type ?? "");
    const isCart = isCartSurfaceDiscountRow(row);
    const itemSurface = !isCart;
    const metaPct = num(meta.discountPercentage ?? meta.discount_percentage);
    const metaFlat = num(meta.discountValue ?? meta.discount_value);
    merchantDiscRows.push({
      amount: amt,
      label: String(row.label ?? row.step ?? "Store offer").trim() || "Store offer",
      offerType:
        ot === "NONE"
          ? itemSurface
            ? "PERCENTAGE"
            : "PRECISION"
          : isCart && (ot === "PERCENTAGE" || ot === "FLAT")
            ? "PRECISION"
            : ot,
      itemSurface,
      discountPercentage: metaPct > 0 && metaPct <= 100 ? metaPct : null,
      discountValue: metaFlat > 0 ? metaFlat : null,
    });
  }

  // Precision/cart-level merchant discount total — for orders_core.merchant_precision_discount
  // ONLY (via the caller's cartPrecisionMerchant return below). Never allocated onto CTM
  // rows: merchant_ctm_pricing_snapshot must only ever reflect item-surface offers.
  //
  // cartSurfaceMerchantDiscountFromBilling is the SSOT: it sums exactly the merchant-funded
  // *precision* rows (isMerchantPrecisionDiscountRow already excludes BOGO / Boost / every
  // item-surface deal and all platform offers/coupons). We must NEVER take Math.max() of it
  // with anything — a max can only ever over-state precision (e.g. by folding in a BOGO's
  // free-unit value). Fall back to the reclassified merchant rows ONLY when the SSOT is
  // silent (legacy bills without precision meta), never in addition to it.
  const billingCartSurface = cartSurfaceMerchantDiscountFromBilling(billingSnapshot);
  const merchantRowsCartSurface = merchantDiscRows
    .filter((r) => !r.itemSurface)
    .reduce((s, r) => s + r.amount, 0);
  const cartSurfaceSum =
    billingCartSurface > 0.005 ? billingCartSurface : merchantRowsCartSurface;
  // Two representations of the SAME finalized precision:
  //  • customer ₹ (cartSurfaceSum)      → orders_core.merchant_precision_discount (billing SSOT).
  //  • commission-scaled (× factor)     → settlement only (merchantGross is commission-scaled).
  const cartPrecisionCustomerTarget = round2(cartSurfaceSum);
  const cartPrecisionMerchantTarget = merchantRupee(cartSurfaceSum * factor);

  // Needed below to distinguish a genuine item-surface Boost (ITEM_PROMO-flagged line)
  // from any other line when classifying the final CTM row offer type.
  const eligRaw =
    (Array.isArray(billingSnapshot?.order_line_eligibility) &&
      billingSnapshot!.order_line_eligibility) ||
    (Array.isArray(billingSnapshot?.orderLineEligibility) &&
      billingSnapshot!.orderLineEligibility) ||
    [];
  const promoIdx = new Set<number>();
  (eligRaw as Array<Record<string, unknown>>).forEach((row, i) => {
    const reason = String(row.ineligibilityReason ?? row.ineligibility_reason ?? "");
    if (reason === "ITEM_PROMO") promoIdx.add(i);
  });

  return {
    rows: prepared.map((p, idx) => {
      // A buy-get deal is a BOGO whether it arrived typed (BOGO/BUY_X_GET_Y/…) OR only labelled
      // "Buy One Get One" by the engine — either signal forces BOGO so it can never become BOOST.
      const hadBogo = isBogoOfferType(p.offerType) || labelLooksBogo(p.offerName);
      const lineIsItemPromo = p.isItemPromo ?? promoIdx.has(idx);
      const hadPctOrFlatBoost =
        lineIsItemPromo === true &&
        isItemPercentOrFlatType(p.offerType) &&
        (p.disc > 0.005 ||
          (p.offerDiscountPct != null && p.offerDiscountPct > 0) ||
          (p.offerDiscountFlat != null && p.offerDiscountFlat > 0));
      const hadItemBoost =
        !hadBogo && (isBoostOfferType(p.offerType) || hadPctOrFlatBoost);

      let offerType = "NONE";
      if (hadBogo) {
        offerType = "BOGO";
      } else if (hadItemBoost) {
        offerType = persistStoreItemOfferType(p.offerType);
      } else if (lineIsItemPromo === true && p.disc > 0.005) {
        offerType = persistStoreItemOfferType(p.offerType);
      } else if (
        lineIsItemPromo === true &&
        merchantDiscRows.some(
          (r) =>
            r.itemSurface &&
            (isBogoOfferType(r.offerType) || labelLooksBogo(r.label))
        )
      ) {
        offerType = "BOGO";
      }

      // gross_value = original MX / catalog selling.
      // net_ctm_value = discounted MX after store offer. Commission is never scaled into net.
      const selling = Math.max(0, round2(p.selling));
      let disc = 0;
      if (isStoreFundedPersistType(offerType)) {
        disc = Math.min(selling, Math.max(0, round2(p.disc)));
        if (disc <= 0.005 && p.offerDiscountPct != null && p.offerDiscountPct > 0 && p.offerDiscountPct <= 100) {
          disc = Math.min(selling, round2((selling * p.offerDiscountPct) / 100));
        }
        if (disc <= 0.005 && p.offerDiscountFlat != null && p.offerDiscountFlat > 0) {
          disc = Math.min(selling, round2(p.offerDiscountFlat));
        }
      }
      const net = round2(Math.max(0, selling - disc));

      let offerDiscountPct = p.offerDiscountPct;
      let offerDiscountFlat = p.offerDiscountFlat;
      if (isStoreFundedPersistType(offerType) && (offerDiscountPct == null || offerDiscountPct <= 0)) {
        const boostMeta = merchantDiscRows.find(
          (r) =>
            r.itemSurface &&
            (r.offerType === "PERCENTAGE" ||
              r.offerType === "FLAT" ||
              r.offerType === "BOOST") &&
            r.discountPercentage != null
        );
        if (boostMeta?.discountPercentage != null) {
          offerDiscountPct = boostMeta.discountPercentage;
        } else if (boostMeta?.discountValue != null && boostMeta.offerType === "FLAT") {
          offerDiscountFlat = boostMeta.discountValue;
        }
      }

      const offerName =
        offerType !== "NONE"
          ? canonicalCtmOfferName({
              offerType,
              offerName: p.offerName,
              offerDiscountPct,
              offerDiscountFlat,
            })
          : null;

      const canon = p.canonicalPricing;
      if (canon && canon.calculationVersion === ITEM_PRICING_CALCULATION_VERSION) {
        const raw = String(canon.merchantOfferRawType ?? canon.merchantOfferType ?? "")
          .toUpperCase()
          .replace(/[-\s]+/g, "_");
        const v2Type = isBogoOfferType(offerType) || canon.merchantOfferType === "BOGO"
          ? "BOGO"
          : raw === "FLAT"
            ? "FLAT"
            : isStoreFundedItemOfferType(raw) || isStoreFundedItemOfferType(canon.merchantOfferType)
              ? "PERCENTAGE"
              : offerType === "BOGO"
                ? "BOGO"
                : "NONE";
        const storeFunded = isStoreFundedItemOfferType(v2Type);
        const v2Disc = storeFunded ? round2(canon.merchantDiscountAmount) : 0;
        const v2Gross = round2(canon.baseCtmLine);
        const v2Net = storeFunded ? round2(canon.discountedCtmLine) : v2Gross;
        return {
          ...p,
          disc: v2Disc,
          net: v2Net,
          gross: v2Gross,
          selling: v2Gross,
          offerType: v2Type,
          offerName: storeFunded
            ? (String(canon.merchantOfferName ?? "").trim() || offerName)
            : v2Type === "BOGO"
              ? offerName
              : null,
          calculationVersion: ITEM_PRICING_CALCULATION_VERSION,
          canonicalPricing: canon,
        };
      }

      return {
        ...p,
        disc,
        net,
        offerType,
        offerName,
        calculationVersion: 1,
      };
    }),
    cartPrecisionMerchant: Math.max(0, cartPrecisionMerchantTarget),
    cartPrecisionCustomer: Math.max(0, cartPrecisionCustomerTarget),
  };
}

export type SettlementBreakdownFromCtm = {
  itemTotal: number;
  packagingCharge: number;
  merchantGross: number;
  couponOfferDiscount: number;
  percentageFlatOfferDiscount: number;
  comboOfferDiscount: number;
  freeDeliveryOfferDiscount: number;
  calculationVersion: number;
  companyFundedDiscount: number;
  platformMerchantShare: number;
  platformCompanyShare: number;
  platformDiscountTotal: number;
};

export function platformFundingFromBilling(
  billingSnapshot: Record<string, unknown> | null | undefined
): {
  total: number;
  merchantShare: number;
  companyShare: number;
  offerId: number | null;
} {
  const rows = Array.isArray(billingSnapshot?.discounts)
    ? (billingSnapshot!.discounts as unknown[])
    : [];
  let total = 0;
  let merchantShare = 0;
  let companyShare = 0;
  let offerId: number | null = null;
  for (const d of rows) {
    if (!d || typeof d !== "object") continue;
    const row = d as Record<string, unknown>;
    const meta =
      row.meta && typeof row.meta === "object" ? (row.meta as Record<string, unknown>) : {};
    const platformOfferId = Number(meta.platformOfferId ?? meta.platform_offer_id);
    const source = String(row.offerSource ?? row.offer_source ?? meta.source ?? "")
      .toUpperCase()
      .replace(/[-\s]+/g, "_");
    const metaSource = String(meta.source ?? "").toLowerCase();
    if (
      metaSource.includes("customer_subscription_free_delivery") ||
      metaSource.includes("gati_mitra_plus")
    ) {
      continue;
    }
    if (!(Number.isFinite(platformOfferId) && platformOfferId > 0) && source !== "PLATFORM" && source !== "PLATFORM_OFFERS") {
      continue;
    }
    const amt = Math.max(0, round2(num(row.amount)));
    const merchant =
      num(meta.merchantContribution ?? meta.merchant_contribution ?? meta.merchantShare);
    const company = num(meta.platformContribution ?? meta.platform_contribution ?? meta.platformShare);
    total = round2(total + amt);
    merchantShare = round2(merchantShare + Math.max(0, merchant));
    companyShare = round2(companyShare + Math.max(0, company));
    if (offerId == null && Number.isFinite(platformOfferId) && platformOfferId > 0) {
      offerId = platformOfferId;
    }
  }
  if (total > 0.005 && merchantShare <= 0.005 && companyShare <= 0.005) {
    companyShare = total;
  }
  return { total, merchantShare, companyShare, offerId };
}

/**
 * TEST 12 / refunds: company-funded platform share is absorbed by the company;
 * only the merchant-funded share may reduce merchant CTM / cancel clawback.
 */
export function merchantRefundFromPlatformFunding(funding: {
  merchantShare: number;
  companyShare: number;
}): { merchantDebit: number; companyAbsorbed: number } {
  return {
    merchantDebit: round2(Math.max(0, funding.merchantShare)),
    companyAbsorbed: round2(Math.max(0, funding.companyShare)),
  };
}

/** Maps a canonicalized CTM merchant_offer_type onto an order_settlement_breakdown payout-B bucket (see 0381 migration). */
function settlementBucketForOfferType(
  offerType: string
): "coupon" | "percentageFlat" | "combo" | null {
  switch (offerType) {
    case "COUPON":
      return "coupon";
    case "BOOST":
    case "PERCENTAGE":
    case "FLAT":
    case "PRECISION":
    case "HAPPY_HOUR":
      return "percentageFlat";
    case "BOGO":
    case "COMBO":
    case "FREE_ITEM":
      return "combo";
    default:
      return null;
  }
}

/**
 * Derive order_settlement_breakdown payout-B buckets from the same CTM rows just
 * computed for this order — settlement must never recompute discounts independently.
 */
export function buildSettlementBreakdownFromCtmRows(
  rows: Array<{ gross: number; disc: number; offerType: string; net?: number; calculationVersion?: number }>,
  billingSnapshot: Record<string, unknown> | null | undefined,
  commissionPercent: number,
  /**
   * Merchant Precision (cart-level) discount, already in merchant-rupee terms — never
   * represented on `rows` (CTM lines only ever carry item-surface offers). Still a
   * real merchant-funded discount, so it must still reduce merchantGross; it's just
   * sourced from orders_core.merchant_precision_discount's own computation instead of
   * being duplicated onto CTM rows. Bucketed with PERCENTAGE/FLAT/CART_% per 0381.
   */
  precisionMerchantAmount = 0
): SettlementBreakdownFromCtm {
  const pct = commissionPercent;
  const factor = Number.isFinite(pct) && pct >= 0 && pct < 100 ? (100 - pct) / 100 : 1;
  const funding = platformFundingFromBilling(billingSnapshot);
  const isV2 = rows.some((r) => r.calculationVersion === ITEM_PRICING_CALCULATION_VERSION);

  let itemTotal = 0;
  let couponOfferDiscount = 0;
  let percentageFlatOfferDiscount = Math.max(0, round2(precisionMerchantAmount));
  let comboOfferDiscount = 0;

  for (const r of rows) {
    if (isV2) {
      const netM = merchantRupee(r.net ?? Math.max(0, r.gross - r.disc));
      const discM = merchantRupee(Math.min(netM + r.disc, r.disc));
      itemTotal = round2(itemTotal + netM);
      const bucket = settlementBucketForOfferType(r.offerType);
      if (bucket === "percentageFlat" && discM > 0.005) {
        percentageFlatOfferDiscount = round2(percentageFlatOfferDiscount + discM);
      } else if (bucket === "combo" && discM > 0.005) {
        comboOfferDiscount = round2(comboOfferDiscount + discM);
      } else if (bucket === "coupon" && discM > 0.005) {
        couponOfferDiscount = round2(couponOfferDiscount + discM);
      }
    } else {
      const grossM = merchantRupee(r.gross * factor);
      const discM = merchantRupee(Math.min(grossM, r.disc * factor));
      itemTotal = round2(itemTotal + grossM);
      const bucket = settlementBucketForOfferType(r.offerType);
      if (!bucket || discM <= 0.005) continue;
      if (bucket === "coupon") couponOfferDiscount = round2(couponOfferDiscount + discM);
      else if (bucket === "percentageFlat")
        percentageFlatOfferDiscount = round2(percentageFlatOfferDiscount + discM);
      else if (bucket === "combo") comboOfferDiscount = round2(comboOfferDiscount + discM);
    }
  }

  const packagingCustomer = num(
    (billingSnapshot as Record<string, unknown> | null)?.packaging_fee ??
      (billingSnapshot as Record<string, unknown> | null)?.packagingFee
  );
  const packagingCharge = merchantRupee(Math.max(0, packagingCustomer) * factor);
  const platformMerchantShare = round2(Math.max(0, funding.merchantShare));
  const platformCompanyShare = round2(Math.max(0, funding.companyShare));
  const platformDiscountTotal = round2(Math.max(0, funding.total));

  const merchantFundedDiscount = round2(
    couponOfferDiscount + percentageFlatOfferDiscount + comboOfferDiscount
  );
  const merchantGross = round2(
    Math.max(
      0,
      isV2
        ? itemTotal + packagingCharge - precisionMerchantAmount - platformMerchantShare
        : itemTotal + packagingCharge - merchantFundedDiscount
    )
  );

  return {
    itemTotal,
    packagingCharge,
    merchantGross,
    couponOfferDiscount,
    percentageFlatOfferDiscount,
    comboOfferDiscount,
    freeDeliveryOfferDiscount: 0,
    calculationVersion: isV2 ? ITEM_PRICING_CALCULATION_VERSION : 1,
    companyFundedDiscount: platformCompanyShare,
    platformMerchantShare,
    platformCompanyShare,
    platformDiscountTotal,
  };
}

/**
 * Upsert order_settlement_breakdown (payout section A/B item_total + discount buckets)
 * from the CTM rows just written, in the same placement transaction. Never touches
 * settlement-time fields (merchant_net, settled, ledger_id, ...) — those are legitimately
 * computed later by payment_process_delivered_settlement() on delivery.
 */
async function upsertSettlementBreakdownFromCtm(
  tx: PostgresJsDatabase<Record<string, unknown>>,
  args: {
    coreOrderId: number;
    commissionPercent: number;
    breakdown: SettlementBreakdownFromCtm;
  }
): Promise<void> {
  const { coreOrderId, commissionPercent, breakdown } = args;
  const pct =
    Number.isFinite(commissionPercent) && commissionPercent >= 0 && commissionPercent < 100
      ? commissionPercent
      : 0;
  // Legacy 2-bucket columns (promo_discount / other_restaurant_discount) still feed
  // payment_process_delivered_settlement()'s payout_meta jsonb; fold combo in so BOGO
  // isn't silently dropped from that display path. coupon/%/flat/combo/free-delivery
  // buckets above remain the precise source for the merchant Summary page.
  const legacyOtherRestaurantDiscount = round2(
    breakdown.percentageFlatOfferDiscount + breakdown.comboOfferDiscount
  );
  try {
    await tx.execute(sql`
        INSERT INTO order_settlement_breakdown (
        order_id, item_total, packaging_charge, merchant_gross, commission_percentage,
        coupon_offer_discount, percentage_flat_offer_discount, combo_offer_discount,
        free_delivery_offer_discount, promo_discount, other_restaurant_discount, fulfillment_status,
        calculation_version, company_funded_discount, platform_merchant_share,
        platform_company_share, platform_discount_total
      ) VALUES (
        ${coreOrderId},
        ${breakdown.itemTotal.toFixed(2)},
        ${breakdown.packagingCharge.toFixed(2)},
        ${breakdown.merchantGross.toFixed(2)},
        ${pct.toFixed(2)},
        ${breakdown.couponOfferDiscount.toFixed(2)},
        ${breakdown.percentageFlatOfferDiscount.toFixed(2)},
        ${breakdown.comboOfferDiscount.toFixed(2)},
        ${breakdown.freeDeliveryOfferDiscount.toFixed(2)},
        ${breakdown.couponOfferDiscount.toFixed(2)},
        ${legacyOtherRestaurantDiscount.toFixed(2)},
        'PLACED',
        ${breakdown.calculationVersion},
        ${breakdown.companyFundedDiscount.toFixed(2)},
        ${breakdown.platformMerchantShare.toFixed(2)},
        ${breakdown.platformCompanyShare.toFixed(2)},
        ${breakdown.platformDiscountTotal.toFixed(2)}
      )
      ON CONFLICT (order_id) DO UPDATE SET
        item_total = EXCLUDED.item_total,
        packaging_charge = EXCLUDED.packaging_charge,
        merchant_gross = EXCLUDED.merchant_gross,
        commission_percentage = EXCLUDED.commission_percentage,
        coupon_offer_discount = EXCLUDED.coupon_offer_discount,
        percentage_flat_offer_discount = EXCLUDED.percentage_flat_offer_discount,
        combo_offer_discount = EXCLUDED.combo_offer_discount,
        free_delivery_offer_discount = EXCLUDED.free_delivery_offer_discount,
        promo_discount = EXCLUDED.promo_discount,
        other_restaurant_discount = EXCLUDED.other_restaurant_discount,
        calculation_version = EXCLUDED.calculation_version,
        company_funded_discount = EXCLUDED.company_funded_discount,
        platform_merchant_share = EXCLUDED.platform_merchant_share,
        platform_company_share = EXCLUDED.platform_company_share,
        platform_discount_total = EXCLUDED.platform_discount_total,
        updated_at = NOW()
      WHERE order_settlement_breakdown.settled = FALSE
    `);
  } catch (err) {
    const code = (err as { code?: string })?.code;
    if (code === "42P01" || code === "42703") {
      console.error(
        "[merchant-ctm] order_settlement_breakdown missing/stale — apply backend/drizzle/0380-0381 migrations. Settlement will fall back to legacy figures for core_order_id=",
        coreOrderId
      );
      return;
    }
    console.error(
      "[merchant-ctm] failed to upsert order_settlement_breakdown for core_order_id=",
      coreOrderId,
      err
    );
  }
}

/**
 * Insert one immutable Merchant CTM row per order item.
 * Returns number of rows written. Soft-fails only if table missing (42P01).
 */
export async function writeMerchantCtmPricingSnapshots(
  tx: PostgresJsDatabase<Record<string, unknown>>,
  args: {
    coreOrderId: number;
    commissionPercent: number;
    billingSnapshot: Record<string, unknown> | null | undefined;
    lines: MerchantCtmLineInput[];
    commission?: ResolvedCommission | null;
    /**
     * Backfill / completion safety net: insert missing rows only.
     * Never overwrite a snapshot that was already frozen at placement.
     */
    preserveExisting?: boolean;
  }
): Promise<number> {
  const { coreOrderId, billingSnapshot, lines } = args;
  if (!Number.isFinite(coreOrderId) || coreOrderId <= 0) {
    console.error("[merchant-ctm] skip write: invalid coreOrderId", coreOrderId);
    return 0;
  }
  if (lines.length === 0) {
    console.error("[merchant-ctm] skip write: no lines for core_order_id=", coreOrderId);
    return 0;
  }

  const { rows, cartPrecisionMerchant, cartPrecisionCustomer } = prepareCtmRows(
    lines,
    args.commissionPercent,
    billingSnapshot
  );
  const preserveExisting = args.preserveExisting === true;

  console.info(
    "[merchant-ctm] ORDER_PLACEMENT",
    JSON.stringify({
      coreOrderId,
      preserveExisting,
      platform_commission: args.commissionPercent,
      lines: rows.map((p) => ({
        orderItemId: p.orderItemId,
        merchant_offer_type: p.offerType,
        merchant_offer_name: p.offerName,
        merchant_offer_discount: p.disc,
        net_ctm_value: p.net,
        gross_value: p.gross,
      })),
    })
  );

  let written = 0;
  const funding = platformFundingFromBilling(billingSnapshot);
  const netSum = rows.reduce((s, r) => s + Math.max(0, r.net), 0);

  for (const p of rows) {
    if (!Number.isFinite(p.orderItemId) || p.orderItemId <= 0) continue;
    const canon = p.canonicalPricing;
    const calcVer = p.calculationVersion === ITEM_PRICING_CALCULATION_VERSION ? ITEM_PRICING_CALCULATION_VERSION : 1;
    const share =
      calcVer === ITEM_PRICING_CALCULATION_VERSION && netSum > 0.005
        ? round2(funding.merchantShare * (p.net / netSum))
        : 0;
    const companyShare =
      calcVer === ITEM_PRICING_CALCULATION_VERSION && netSum > 0.005
        ? round2(funding.companyShare * (p.net / netSum))
        : 0;
    const settlement = round2(Math.max(0, p.net - share));
    const offerSnap = JSON.stringify(canon?.merchantOfferSnapshot ?? {});
    const fulfilled = Math.max(1, Number(p.quantity) || 1);
    let paidQty = fulfilled;
    let freeQty = 0;
    if (p.offerType === "BOGO") {
      const catalog = num(p.customerCatalogLine);
      const custDisc = num(p.customerOfferDiscount);
      const unit = catalog / fulfilled;
      if (unit > 0.005 && custDisc > 0.005) {
        freeQty = Math.min(fulfilled, Math.max(0, Math.round(custDisc / unit)));
        paidQty = fulfilled - freeQty;
      }
    }
    const conflictClause = preserveExisting
      ? sql`ON CONFLICT (order_item_id) DO NOTHING`
      : sql`ON CONFLICT (order_item_id) DO UPDATE SET
            core_order_id = EXCLUDED.core_order_id,
            menu_item_id = EXCLUDED.menu_item_id,
            gross_value = EXCLUDED.gross_value,
            merchant_offer_type = EXCLUDED.merchant_offer_type,
            merchant_offer_name = EXCLUDED.merchant_offer_name,
            merchant_offer_discount = EXCLUDED.merchant_offer_discount,
            net_ctm_value = EXCLUDED.net_ctm_value,
            calculation_version = EXCLUDED.calculation_version,
            base_ctm_value = EXCLUDED.base_ctm_value,
            discounted_ctm_value = EXCLUDED.discounted_ctm_value,
            commission_percent = EXCLUDED.commission_percent,
            commission_amount = EXCLUDED.commission_amount,
            customer_item_price = EXCLUDED.customer_item_price,
            merchant_offer_id = EXCLUDED.merchant_offer_id,
            merchant_offer_snapshot = EXCLUDED.merchant_offer_snapshot,
            platform_offer_id = EXCLUDED.platform_offer_id,
            platform_discount_total = EXCLUDED.platform_discount_total,
            merchant_funded_discount = EXCLUDED.merchant_funded_discount,
            company_funded_discount = EXCLUDED.company_funded_discount,
            merchant_settlement_ctm = EXCLUDED.merchant_settlement_ctm,
            paid_quantity = EXCLUDED.paid_quantity,
            free_quantity = EXCLUDED.free_quantity,
            fulfilled_quantity = EXCLUDED.fulfilled_quantity`;
    try {
      await tx.execute(sql`
          INSERT INTO merchant_ctm_pricing_snapshot (
            core_order_id, order_item_id, menu_item_id,
            gross_value, merchant_offer_type, merchant_offer_name,
            merchant_offer_discount, net_ctm_value,
            calculation_version, base_ctm_value, discounted_ctm_value,
            commission_percent, commission_amount, customer_item_price,
            merchant_offer_id, merchant_offer_snapshot,
            platform_offer_id, platform_discount_total,
            merchant_funded_discount, company_funded_discount,
            merchant_settlement_ctm,
            paid_quantity, free_quantity, fulfilled_quantity
          ) VALUES (
            ${coreOrderId},
            ${p.orderItemId},
            ${p.menuItemId},
            ${p.gross.toFixed(2)},
            ${p.offerType},
            ${p.offerName},
            ${p.disc.toFixed(2)},
            ${p.net.toFixed(2)},
            ${calcVer},
            ${(canon?.baseCtmLine ?? p.gross).toFixed(2)},
            ${(canon?.discountedCtmLine ?? p.net).toFixed(2)},
            ${(canon?.commissionRate ?? args.commissionPercent).toFixed(2)},
            ${(canon?.commissionAmount ?? 0).toFixed(2)},
            ${(canon?.customerItemPriceLine ?? 0).toFixed(2)},
            ${canon?.merchantOfferId ?? null},
            ${offerSnap}::jsonb,
            ${funding.offerId},
            ${round2(funding.total * (netSum > 0 ? p.net / netSum : 0)).toFixed(2)},
            ${share.toFixed(2)},
            ${companyShare.toFixed(2)},
            ${settlement.toFixed(2)},
            ${paidQty.toFixed(3)},
            ${freeQty.toFixed(3)},
            ${fulfilled.toFixed(3)}
          )
          ${conflictClause}
      `);
      written += 1;
    } catch (err) {
      const code = (err as { code?: string })?.code;
      if (code === "42P01") {
        console.error(
          "[merchant-ctm] merchant_ctm_pricing_snapshot missing — apply backend/drizzle/0411_merchant_ctm_pricing_snapshot.sql (and partnersite 0128). Order placed WITHOUT CTM snapshot."
        );
        return 0;
      }
      if (code === "23514") {
        console.error(
          "[merchant-ctm] snapshot check constraint rejected the row — apply backend/drizzle/0560_merchant_ctm_offer_type_percentage.sql (PERCENTAGE/FLAT) plus 0555/0557. order_item_id=",
          p.orderItemId,
          { offerType: p.offerType, disc: p.disc, net: p.net, gross: p.gross }
        );
      }
      console.error("[merchant-ctm] insert failed for order_item_id=", p.orderItemId, err);
      throw err;
    }
  }

  // Freeze cart/precision ₹ on the order so partner CTM can always subtract it.
  // Completion/backfill must not rewrite precision or settlement once placement froze them.
  if (written > 0 && !preserveExisting) {
    // orders_core.merchant_precision_discount must equal the EXACT Merchant Precision the
    // Billing Engine finalized and the customer sees in the billing breakdown (customer ₹) —
    // never a recomputed or commission-scaled figure. `cartPrecisionCustomer` is that value
    // (SSOT: cartSurfaceMerchantDiscountFromBilling, which already excludes every BOGO / Boost /
    // item-surface deal and all platform offers). The commission-scaled `cartPrecisionMerchant`
    // is used ONLY for settlement math below.
    //
    // Bug this fixes: previously the commission-scaled value was frozen here, so a ₹90 Billing
    // Engine precision landed in the DB as ₹90 × (100 − commission%)/100 ≈ ₹77.
    const precision = Math.max(0, round2(cartPrecisionCustomer));
    const precisionMerchant = Math.max(0, merchantRupee(cartPrecisionMerchant));
    try {
      // Dedicated update — do not bundle total_ctm (missing/legacy cols must not block this).
      await tx.execute(sql`
        UPDATE orders_core
        SET
          merchant_precision_discount = ${precision.toFixed(2)}::numeric,
          updated_at = NOW()
        WHERE id = ${coreOrderId}
      `);
      if (precision > 0.005) {
        console.info(
          `[merchant-ctm] froze merchant_precision_discount=${precision} (billing-engine value) for core_order_id=${coreOrderId}`
        );
      }
    } catch (err) {
      const code = (err as { code?: string })?.code;
      if (code === "42703") {
        console.error(
          "[merchant-ctm] orders_core.merchant_precision_discount missing — apply backend/drizzle/0412_merchant_precision_discount_ctm.sql"
        );
      } else {
        console.error("[merchant-ctm] failed to freeze merchant_precision_discount:", err);
        // Retry via drizzle schema column (same tx) before giving up silently.
        try {
          const { ordersCore } = await import("../../db/schema.js");
          const { eq } = await import("drizzle-orm");
          await tx
            .update(ordersCore)
            .set({
              merchantPrecisionDiscount: precision.toFixed(2),
              updatedAt: new Date(),
            })
            .where(eq(ordersCore.id, coreOrderId));
        } catch (err2) {
          console.error("[merchant-ctm] drizzle fallback also failed for merchant_precision_discount:", err2);
        }
      }
    }

    // Settlement/ledger must never diverge from the CTM figures just written — upsert
    // order_settlement_breakdown from the same rows instead of leaving it unpopulated.
    // Precision is folded in separately (not represented on `rows`) so it still
    // reduces merchant settlement even though it's never written onto a CTM line.
    const breakdown = buildSettlementBreakdownFromCtmRows(
      rows,
      billingSnapshot,
      args.commissionPercent,
      // Settlement subtracts precision from a commission-scaled merchantGross, so it needs the
      // commission-scaled precision — NOT the customer-scale value frozen on orders_core above.
      precisionMerchant
    );
    await upsertSettlementBreakdownFromCtm(tx, {
      coreOrderId,
      commissionPercent: args.commissionPercent,
      breakdown,
    });
    try {
      await tx.execute(sql`
        UPDATE orders_core
        SET total_ctm = ${breakdown.merchantGross.toFixed(2)}::numeric,
            updated_at = NOW()
        WHERE id = ${coreOrderId}
      `);
    } catch (err) {
      if ((err as { code?: string })?.code !== "42703") {
        console.error("[merchant-ctm] failed to freeze orders_core.total_ctm", err);
      }
    }
  }

  if (written < lines.length) {
    console.error(
      `[merchant-ctm] wrote ${written}/${lines.length} rows for core_order_id=${coreOrderId}`
    );
  }
  return written;
}

/**
 * Post-placement safety net: if CTM rows are missing for an order, rebuild from
 * orders_core_items + billing_snapshot. Never throws (logs only) so checkout UX
 * is unaffected; merchant screens fall back until backfill succeeds.
 */
export async function ensureMerchantCtmPricingSnapshotsForOrder(
  db: PostgresJsDatabase<Record<string, unknown>>,
  args: {
    coreOrderId: number;
    orderIdText: string;
    commissionPercent?: number;
  }
): Promise<void> {
  const { coreOrderId, orderIdText } = args;
  if (!Number.isFinite(coreOrderId) || coreOrderId <= 0 || !orderIdText) return;

  try {
    // Select each line's OWN frozen offer economics. These columns (applied_offer_*,
    // ineligibility_reason, offer_discount_amount) are the per-item SSOT the merchant/partner
    // surfaces read; the CTM snapshot is a pure 1:1 projection of them. Older schemas may lack
    // applied_offer_id / ineligibility_reason — fall back to a select without them.
    let itemRows: unknown;
    let hasFrozenOfferMeta = true;
    try {
      itemRows = await db.execute(sql`
        SELECT id, menu_item_id, quantity, base_price, addon_price, total_price,
          offer_discount_amount, applied_offer_label, applied_offer_type,
          applied_offer_id, ineligibility_reason, item_snapshot
        FROM orders_core_items
        WHERE order_id = ${orderIdText}
        ORDER BY id ASC
      `);
    } catch (err) {
      if ((err as { code?: string })?.code !== "42703") throw err;
      try {
        itemRows = await db.execute(sql`
          SELECT id, menu_item_id, quantity, base_price, addon_price, total_price,
            offer_discount_amount, applied_offer_label, applied_offer_type,
            applied_offer_id, ineligibility_reason
          FROM orders_core_items
          WHERE order_id = ${orderIdText}
          ORDER BY id ASC
        `);
      } catch (err2) {
        if ((err2 as { code?: string })?.code !== "42703") throw err2;
        hasFrozenOfferMeta = false;
        itemRows = await db.execute(sql`
          SELECT id, menu_item_id, quantity, base_price, addon_price, total_price,
            offer_discount_amount, applied_offer_label, applied_offer_type
          FROM orders_core_items
          WHERE order_id = ${orderIdText}
          ORDER BY id ASC
        `);
      }
    }
    const items = itemRows as unknown as Array<{
      id: number | string;
      menu_item_id: number | string | null;
      quantity: number | string;
      base_price: unknown;
      addon_price: unknown;
      total_price: unknown;
      offer_discount_amount: unknown;
      applied_offer_label: string | null;
      applied_offer_type: string | null;
      applied_offer_id?: number | string | null;
      ineligibility_reason?: string | null;
      item_snapshot?: Record<string, unknown> | null;
    }>;
    if (items.length === 0) return;

    const existingSnap = await db.execute(sql`
      SELECT order_item_id
      FROM merchant_ctm_pricing_snapshot
      WHERE core_order_id = ${coreOrderId}
    `);
    const existingRaw = Array.isArray(existingSnap)
      ? existingSnap
      : ((existingSnap as { rows?: unknown })?.rows ?? []);
    const existingIds = new Set(
      (existingRaw as Array<{ order_item_id: number | string }>).map((r) => Number(r.order_item_id))
    );
    const missingItems = items.filter((row) => !existingIds.has(Number(row.id)));
    if (missingItems.length === 0) {
      console.info(
        "[merchant-ctm] ORDER_COMPLETION preserve",
        JSON.stringify({
          coreOrderId,
          orderIdText,
          existing: existingIds.size,
          reason: "snapshots already frozen at placement",
        })
      );
      return;
    }

    const coreRows = await db.execute(sql`
      SELECT billing_snapshot, merchant_store_id
      FROM orders_core
      WHERE id = ${coreOrderId}
      LIMIT 1
    `);
    const core = (coreRows as unknown as Array<{
      billing_snapshot: unknown;
      merchant_store_id: number | string | null;
    }>)[0];
    const billingSnapshot =
      core?.billing_snapshot && typeof core.billing_snapshot === "object"
        ? (core.billing_snapshot as Record<string, unknown>)
        : null;

    let pct = args.commissionPercent ?? 0;
    if (!(Number.isFinite(pct) && pct >= 0 && pct < 100)) {
      const snapPct = await db.execute(sql`
        SELECT commission_percent
        FROM order_item_commission_snapshots
        WHERE order_id = ${coreOrderId}
        LIMIT 1
      `);
      const p = Number(
        (snapPct as unknown as Array<{ commission_percent: unknown }>)[0]?.commission_percent
      );
      if (Number.isFinite(p) && p >= 0 && p < 100) pct = p;
    }

    // Rebuild each CTM line from its OWN frozen orders_core_items columns — a strict 1:1
    // projection, never a cross-item match against the shared billing array. This is what makes
    // the snapshot leak-proof: one item's offer can no longer bleed onto another's row.
    //
    // Legacy fallback: some historical rows (older placement paths) never froze the applied_offer_*
    // columns. ONLY for such rows do we read the billing snapshot, and then strictly per line
    // (the row at this line's own index / matching this line's own menu id) — never a pooled or
    // reassigned allocation across items.
    const pricingRows = (
      (Array.isArray(billingSnapshot?.order_line_pricing) && billingSnapshot!.order_line_pricing) ||
      (Array.isArray(billingSnapshot?.orderLinePricing) && billingSnapshot!.orderLinePricing) ||
      []
    ) as Array<Record<string, unknown>>;

    const lines: MerchantCtmLineInput[] = items.map((row, i) => {
      const qty = Math.max(1, Number(row.quantity) || 1);
      const total = num(row.total_price);
      const base = num(row.base_price);
      const addon = num(row.addon_price);
      const customerCatalog = total > 0.005 ? total : round2(base * qty + addon * qty);
      const menuId = row.menu_item_id != null ? Number(row.menu_item_id) : null;
      // Single deterministic resolver for EVERY order-placement path: use the line's own frozen
      // offer columns when present, else recover the line's offer from the finalized billing
      // snapshot. Never defaults to NONE while the Billing Engine tagged the line as BOGO/BOOST.
      return resolveBackfillCtmLineInput(
        {
          orderItemId: Number(row.id),
          menuItemId: menuId,
          quantity: qty,
          catalogLineTotal: customerCatalog,
          ownOfferType: row.applied_offer_type ?? null,
          ownOfferLabel: row.applied_offer_label ?? null,
          ownOfferId: row.applied_offer_id != null ? Number(row.applied_offer_id) : null,
          ownOfferDiscount: num(row.offer_discount_amount),
          ownIneligibilityReason: hasFrozenOfferMeta ? (row.ineligibility_reason ?? null) : undefined,
          itemSnapshot:
            row.item_snapshot && typeof row.item_snapshot === "object" ? row.item_snapshot : null,
        },
        pricingRows,
        i
      );
    });

    const written = await writeMerchantCtmPricingSnapshots(db, {
      coreOrderId,
      commissionPercent: pct,
      billingSnapshot,
      lines: existingIds.size > 0
        ? lines.filter((l) => !existingIds.has(l.orderItemId))
        : lines,
      preserveExisting: existingIds.size > 0,
    });
    if (written > 0) {
      console.info(
        `[merchant-ctm] ORDER_COMPLETION backfill ${written} missing rows for order ${orderIdText} (core_id=${coreOrderId})`
      );
    }
  } catch (err) {
    const code = (err as { code?: string })?.code;
    if (code === "42P01") {
      console.error(
        "[merchant-ctm] ensure skipped — table missing. Apply 0411 / 0128 migrations."
      );
      return;
    }
    console.error("[merchant-ctm] ensureMerchantCtmPricingSnapshotsForOrder failed:", err);
  }
}
