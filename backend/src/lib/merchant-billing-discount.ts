/**
 * Merchant-facing bill: only restaurant-funded discounts count.
 * Platform / GatiMitra offers are excluded from merchant totals.
 */

function num(v: unknown): number {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  const n = parseFloat(String(v ?? "0"));
  return Number.isFinite(n) ? n : 0;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function metaOf(row: Record<string, unknown>): Record<string, unknown> | null {
  const m = row.meta;
  return m && typeof m === "object" ? (m as Record<string, unknown>) : null;
}

/** Per discount line: amount that affects merchant bill (₹). */
export function merchantFundedAmountFromDiscountLine(
  row: Record<string, unknown>,
): number {
  const amount = num(row.amount);
  if (amount <= 0) return 0;

  const meta = metaOf(row);

  if (meta?.merchantOfferId != null && String(meta.merchantOfferId).trim() !== "") {
    return round2(amount);
  }

  if (meta?.platformOfferId != null && String(meta.platformOfferId).trim() !== "") {
    const merchantContrib =
      num(meta.merchantContribution) ??
      num(meta.merchant_contribution) ??
      num(row.merchantShare) ??
      0;
    return round2(Math.max(0, merchantContrib));
  }

  const source = String(
    row.offerSource ?? row.offer_source ?? meta?.source ?? "",
  ).toUpperCase();

  if (source === "PLATFORM") return 0;
  if (
    source === "MERCHANT" ||
    source === "MERCHANT_OFFERS" ||
    source === "merchant_offers"
  ) {
    return round2(amount);
  }

  if (source === "COUPON") {
    if (meta?.merchantOfferId != null) return round2(amount);
    return 0;
  }

  return 0;
}

export function merchantFundedDiscountFromBilling(
  billing: Record<string, unknown> | null | undefined,
): number {
  if (!billing || typeof billing !== "object") return 0;
  let sum = 0;
  const discounts = Array.isArray(billing.discounts) ? billing.discounts : [];
  for (const d of discounts) {
    if (!d || typeof d !== "object") continue;
    sum += merchantFundedAmountFromDiscountLine(d as Record<string, unknown>);
  }
  return round2(sum);
}

/**
 * True when this discount row is a **merchant store precision / cart checkout offer**.
 * Platform coupons, platform offers, Boost/BOGO item deals, and free-delivery are excluded.
 * Used to freeze `orders_core.merchant_precision_discount` at placement.
 */
export function isCartSurfaceDiscountRow(row: Record<string, unknown>): boolean {
  return isMerchantPrecisionDiscountRow(row);
}

/**
 * Merchant store precision offer only (checkout-applied cart promo funded by the restaurant).
 * Never true for platform checkout offers / platform coupons.
 */
export function isMerchantPrecisionDiscountRow(row: Record<string, unknown>): boolean {
  const meta = metaOf(row);
  if (!meta) return false;

  // Platform checkout offer / coupon → never merchant precision.
  if (meta.platformOfferId != null && String(meta.platformOfferId).trim() !== "") {
    return false;
  }
  const source = String(
    row.offerSource ?? row.offer_source ?? meta.source ?? "",
  )
    .toUpperCase()
    .replace(/[-\s]+/g, "_");
  if (source === "PLATFORM" || source === "PLATFORM_OFFERS") return false;

  // Must be a real merchant offer id from the store.
  if (meta.merchantOfferId == null || String(meta.merchantOfferId).trim() === "") {
    return false;
  }

  // Boost / BOGO / item-surface deals are not precision.
  if (meta.itemSurface === true || meta.item_surface === true) return false;

  const ot = String(meta.offerType ?? meta.offer_type ?? "")
    .toUpperCase()
    .replace(/[-\s]+/g, "_");
  // Any buy-get / free-unit / item-surface deal is NEVER precision, no matter how the
  // merchant row spelled its type (BOGO, BOGO_50, BUY_ONE_GET_ONE, "Buy 2 Get 1", …).
  // Matching only the three canonical strings let odd spellings leak a BOGO's free-unit ₹
  // into orders_core.merchant_precision_discount when the itemSurface flag was absent.
  const isBuyGetFamily =
    ot.startsWith("BOGO") || (ot.includes("BUY") && ot.includes("GET"));
  if (
    isBuyGetFamily ||
    ot === "FREE_ITEM" ||
    ot === "BUNDLE" ||
    ot === "BOOST" ||
    ot === "FREE_DELIVERY"
  ) {
    return false;
  }

  // Platform-style coupon codes without merchant funding already excluded above;
  // merchant COUPON type only counts when it's cart/precision (not item).
  const mode = String(meta.conditionsMode ?? meta.conditions_mode ?? "")
    .toLowerCase()
    .trim();
  if (mode === "boost" || mode === "bogo") return false;
  if (mode === "precision") return true;

  const label = String(row.label ?? row.step ?? "").toLowerCase();
  if (/\bprecision\b/.test(label)) return true;

  if (ot === "PRECISION" || ot === "CART_PERCENTAGE" || ot === "CART_FLAT") {
    return true;
  }

  const cartSurface =
    meta.cartSurface === true ||
    meta.cart_surface === true ||
    meta.itemSurface === false ||
    meta.item_surface === false;

  // Cart-level % / flat from the store (precision path at checkout).
  if (cartSurface && (ot === "PERCENTAGE" || ot === "FLAT" || ot === "COUPON" || ot === "")) {
    return true;
  }

  return false;
}

/**
 * Merchant-funded **precision** discount from billing_snapshot (customer ₹).
 * Platform offers / coupons are never included.
 */
export function cartSurfaceMerchantDiscountFromBilling(
  billing: Record<string, unknown> | null | undefined,
): number {
  if (!billing || typeof billing !== "object") return 0;
  let sum = 0;
  const discounts = Array.isArray(billing.discounts) ? billing.discounts : [];
  for (const d of discounts) {
    if (!d || typeof d !== "object") continue;
    const row = d as Record<string, unknown>;
    if (!isMerchantPrecisionDiscountRow(row)) continue;
    // Only full merchant-funded amount (never platform merchantContribution crumbs).
    const meta = metaOf(row);
    if (meta?.platformOfferId != null && String(meta.platformOfferId).trim() !== "") {
      continue;
    }
    const amt = merchantFundedAmountFromDiscountLine(row);
    if (amt > 0.005) sum = round2(sum + amt);
  }
  return round2(sum);
}

export type MerchantDiscountLine = { label: string; amount: number };

export function merchantFundedDiscountLinesFromBilling(
  billing: Record<string, unknown> | null | undefined,
): MerchantDiscountLine[] {
  const out: MerchantDiscountLine[] = [];
  if (!billing || typeof billing !== "object") return out;
  const discounts = Array.isArray(billing.discounts) ? billing.discounts : [];
  for (const d of discounts) {
    if (!d || typeof d !== "object") continue;
    const row = d as Record<string, unknown>;
    const amt = merchantFundedAmountFromDiscountLine(row);
    if (amt <= 0) continue;
    const label =
      String(row.label ?? row.step ?? "Restaurant discount").trim() ||
      "Restaurant discount";
    out.push({ label, amount: amt });
  }
  return out;
}

function menuIdAliases(raw: unknown): string[] {
  const s = String(raw ?? "").trim();
  if (!s) return [];
  const out = new Set<string>([s]);
  // "_" split only for a NUMERIC menu-id prefix ("102_half" → "102"); an opaque store item id
  // like "HC77_d408a86767dbd6e1" is never split ("HC77" would alias-match the whole store).
  if (s.includes("::")) {
    const base = s.split("::")[0]!;
    if (base) out.add(base);
    const asNum = Number(base);
    if (Number.isFinite(asNum) && asNum > 0) out.add(String(asNum));
  } else if (s.includes("_")) {
    const prefix = s.split("_")[0]!;
    if (prefix && /^\d+$/.test(prefix)) out.add(prefix);
  }
  return [...out];
}

function isItemSurfaceDiscountRow(row: Record<string, unknown>): boolean {
  const meta = metaOf(row);
  if (!meta) return false;
  if (meta.itemSurface === true || meta.item_surface === true) return true;
  if (meta.itemSurface === false || meta.cartSurface === true || meta.cart_surface === true) {
    return false;
  }
  const ot = String(meta.offerType ?? meta.offer_type ?? "")
    .toUpperCase()
    .trim();
  if (
    ot === "CART_PERCENTAGE" ||
    ot === "CART_FLAT" ||
    ot === "COUPON" ||
    ot === "FREE_DELIVERY" ||
    ot === "TIERED"
  ) {
    return false;
  }
  // Legacy Boost / BOGO / item % without flag — only when merchantOfferId present.
  if (meta.merchantOfferId == null) return false;
  return (
    ot === "" ||
    ot === "PERCENTAGE" ||
    ot === "FLAT" ||
    ot === "BOGO" ||
    ot === "BUY_X_GET_Y" ||
    ot === "BUY_N_GET_M" ||
    ot === "FREE_ITEM" ||
    ot === "BUNDLE"
  );
}

/** Merchant-funded item-surface (Boost/BOGO) discount pool + primary label. */
export function itemSurfaceMerchantDiscountFromBilling(
  billing: Record<string, unknown> | null | undefined,
): { amount: number; label: string | null } {
  if (!billing || typeof billing !== "object") return { amount: 0, label: null };
  const discounts = Array.isArray(billing.discounts) ? billing.discounts : [];
  let amount = 0;
  let label: string | null = null;
  for (const d of discounts) {
    if (!d || typeof d !== "object") continue;
    const row = d as Record<string, unknown>;
    if (!isItemSurfaceDiscountRow(row)) continue;
    const amt = merchantFundedAmountFromDiscountLine(row);
    if (amt <= 0) continue;
    amount = round2(amount + amt);
    if (!label) {
      label =
        String(row.label ?? row.step ?? "Item offer").trim() || "Item offer";
    }
  }
  return { amount, label };
}

export type MerchantItemWithOfferFields = {
  price: number;
  menu_item_id?: number | null;
  name?: string;
  offer_label?: string | null;
  offer_discount?: number;
  catalog_line_total?: number;
  net_line_total?: number;
  is_item_promo?: boolean;
  applied_offer_type?: string | null;
};

function formatMerchantOfferLabel(
  label: string | null | undefined,
  offerType: string | null | undefined,
): string | null {
  const raw = (label ?? "").trim();
  const t = String(offerType ?? "").toUpperCase().trim();
  const pctMatch = raw.match(/(\d+(?:\.\d+)?)\s*%/);
  const pctPart = pctMatch ? `${pctMatch[1]}% OFF` : null;

  if (t === "BOGO" || t === "BUY_X_GET_Y" || t === "BUY_N_GET_M") {
    const m = raw.match(/buy\s*(\d+|one)\s*get\s*(\d+|one)/i);
    if (m) {
      const buy = /one/i.test(m[1]!) ? "1" : m[1]!;
      const get = /one/i.test(m[2]!) ? "1" : m[2]!;
      return `Buy ${buy} Get ${get}`;
    }
    if (/buy\s*one\s*get\s*one/i.test(raw)) return "Buy 1 Get 1";
    return raw || "Buy 1 Get 1";
  }
  if (t === "FREE_ITEM") return "Free Item Offer Applied";
  if (t === "BUNDLE") return "Combo Offer Applied";
  if (/\bboost\b/i.test(raw) || t === "BOOST" || t === "PERCENTAGE" || t === "FLAT") {
    return "Boost Offer Applied";
  }
  if (/\bprecision\b/i.test(raw) || t === "PRECISION") {
    return "Precision Offer Applied";
  }
  if (t === "PERCENTAGE" || t === "FLAT" || t === "CART_PERCENTAGE" || t === "CART_FLAT") {
    return pctPart ? `Store Offer Applied • ${pctPart}` : "Store Offer Applied";
  }
  if (raw) {
    if (pctPart && !/store offer applied/i.test(raw)) {
      // e.g. title "15% Off Chicken" → Store Offer Applied • 15% OFF
      if (/^\d+(\.\d+)?%\s*(off|OFF)?$/i.test(raw) || pctMatch) {
        return `Store Offer Applied • ${pctPart}`;
      }
    }
    return raw;
  }
  if (!t) return null;
  return `${t.replace(/_/g, " ")} Offer Applied`;
}

/**
 * Prefer billing_snapshot.order_line_pricing (Pricing Engine SSOT).
 * Scales customer-visible catalog/effective onto merchant-base `price` when needed.
 * Returns null when the snapshot has no per-line discounts so legacy heuristics can run.
 */
function annotateFromOrderLinePricingSnapshot<T extends MerchantItemWithOfferFields>(
  items: T[],
  pricingRows: Array<Record<string, unknown>>,
): T[] | null {
  if (!pricingRows.length) return null;
  let anyOffer = false;
  const out = items.map((it, i) => {
    const mid = it.menu_item_id != null ? String(it.menu_item_id) : "";
    const row =
      pricingRows[i] ??
      (mid
        ? pricingRows.find((r) =>
            menuIdAliases(r.menuItemId ?? r.menu_item_id).some((a) =>
              menuIdAliases(mid).includes(a),
            ),
          )
        : undefined);
    const merchantCatalog = round2(num(it.price));
    if (!row) {
      return {
        ...it,
        catalog_line_total: merchantCatalog,
        net_line_total: merchantCatalog,
        offer_discount: 0,
        offer_label: null,
        is_item_promo: false,
        applied_offer_type: null,
      };
    }
    const custCatalog = round2(
      Math.max(0, num(row.catalogLineTotal ?? row.catalog_line_total ?? merchantCatalog)),
    );
    const custDisc = round2(Math.max(0, num(row.offerDiscountAmount ?? row.offer_discount_amount)));
    let custEffective = round2(num(row.effectiveLineTotal ?? row.effective_line_total));
    if (!Number.isFinite(custEffective) || custEffective < 0) {
      custEffective = round2(Math.max(0, custCatalog - custDisc));
    }
    const scale =
      custCatalog > 0.005 ? Math.min(1.5, Math.max(0.5, merchantCatalog / custCatalog)) : 1;
    const offerDisc = round2(Math.min(merchantCatalog, custDisc * scale));
    const net = round2(Math.max(0, merchantCatalog - offerDisc));
    const offerType = String(row.appliedOfferType ?? row.applied_offer_type ?? "").trim() || null;
    const offerLabel = formatMerchantOfferLabel(
      String(row.appliedOfferLabel ?? row.applied_offer_label ?? "").trim() || null,
      offerType,
    );
    const isPromo = offerDisc > 0.005 || net < merchantCatalog - 0.005;
    if (isPromo) anyOffer = true;
    return {
      ...it,
      catalog_line_total: merchantCatalog,
      net_line_total: isPromo ? net : merchantCatalog,
      offer_discount: isPromo ? offerDisc : 0,
      offer_label: isPromo ? offerLabel : null,
      is_item_promo: isPromo,
      applied_offer_type: isPromo ? offerType : null,
    };
  });
  // Empty discounts in snapshot → fall through to DB columns / discounts[] heuristic.
  if (
    !anyOffer &&
    !pricingRows.some((r) => num(r.offerDiscountAmount ?? r.offer_discount_amount) > 0.005)
  ) {
    return null;
  }
  return out;
}

/**
 * Attach per-line store-offer labels + effective selling price for merchant incoming UI.
 * Prefers `order_line_pricing` from the billing snapshot (no client recalculation).
 * `price` stays catalog (menu base × qty); `net_line_total` is after item-offer share.
 */
export function annotateMerchantItemsWithItemOffers<T extends MerchantItemWithOfferFields>(
  items: T[],
  billing: Record<string, unknown> | null | undefined,
): T[] {
  if (!items.length) return items;

  const pricingRaw =
    (Array.isArray(billing?.order_line_pricing) && billing?.order_line_pricing) ||
    (Array.isArray(billing?.orderLinePricing) && billing?.orderLinePricing) ||
    [];
  if (pricingRaw.length > 0) {
    const fromSnap = annotateFromOrderLinePricingSnapshot(
      items,
      pricingRaw as Array<Record<string, unknown>>,
    );
    if (fromSnap) return fromSnap;
  }

  // Prefer columns already loaded from orders_core_items (frozen at placement).
  if (
    items.some(
      (it) =>
        (it.offer_discount != null && num(it.offer_discount) > 0.005) ||
        (it.net_line_total != null &&
          it.catalog_line_total != null &&
          Math.abs(num(it.net_line_total) - num(it.catalog_line_total)) > 0.005),
    )
  ) {
    return items.map((it) => {
      const catalog = round2(num(it.catalog_line_total ?? it.price));
      const disc = round2(Math.max(0, num(it.offer_discount)));
      const net = round2(
        it.net_line_total != null ? num(it.net_line_total) : Math.max(0, catalog - disc),
      );
      const isPromo = disc > 0.005 || net < catalog - 0.005;
      return {
        ...it,
        catalog_line_total: catalog,
        net_line_total: isPromo ? net : catalog,
        offer_discount: isPromo ? disc : 0,
        offer_label: isPromo
          ? formatMerchantOfferLabel(it.offer_label, it.applied_offer_type)
          : null,
        is_item_promo: isPromo,
      };
    });
  }

  const eligRaw =
    (Array.isArray(billing?.order_line_eligibility) && billing?.order_line_eligibility) ||
    (Array.isArray(billing?.orderLineEligibility) && billing?.orderLineEligibility) ||
    [];
  const eligRows = (eligRaw as unknown[]).filter(
    (r) => r && typeof r === "object",
  ) as Array<Record<string, unknown>>;

  const promoByAlias = new Map<string, Record<string, unknown>>();
  let customerPromoSum = 0;
  for (const row of eligRows) {
    const reason = String(row.ineligibilityReason ?? row.ineligibility_reason ?? "");
    const ineligible =
      row.isDiscountEligible === false || row.is_discount_eligible === false;
    if (!ineligible || reason !== "ITEM_PROMO") continue;
    customerPromoSum = round2(customerPromoSum + Math.max(0, num(row.lineTotal ?? row.line_total)));
    for (const a of menuIdAliases(row.menuItemId ?? row.menu_item_id)) {
      promoByAlias.set(a, row);
    }
  }

  const { amount: customerItemDisc, label: offerLabel } =
    itemSurfaceMerchantDiscountFromBilling(billing);

  // Legacy bills without itemSurface meta: if ITEM_PROMO lines exist, use full merchant discount.
  let discPoolCustomer = customerItemDisc;
  let label = offerLabel;
  if (discPoolCustomer <= 0.005 && promoByAlias.size > 0) {
    discPoolCustomer = merchantFundedDiscountFromBilling(billing);
    if (discPoolCustomer > 0.005 && !label) {
      const lines = merchantFundedDiscountLinesFromBilling(billing);
      label = lines[0]?.label ?? "Item offer";
    }
  }

  if (discPoolCustomer <= 0.005 || promoByAlias.size === 0) {
    // Cart-surface / legacy bills: no ITEM_PROMO flags — still allocate merchant item discount.
    if (discPoolCustomer <= 0.005) {
      const funded = merchantFundedDiscountFromBilling(billing);
      if (funded > 0.005) {
        discPoolCustomer = funded;
        if (!label) {
          const lines = merchantFundedDiscountLinesFromBilling(billing);
          label = lines[0]?.label ?? "Store offer";
        }
      }
    }
    if (discPoolCustomer <= 0.005) {
      return items.map((it) => ({
        ...it,
        catalog_line_total: round2(num(it.price)),
        net_line_total: round2(num(it.price)),
        offer_discount: 0,
        offer_label: null,
        is_item_promo: false,
      }));
    }
    // Allocate across all lines by catalog weight.
    const weightSum = items.reduce((s, it) => s + Math.max(0, num(it.price)), 0);
    if (weightSum <= 0.005) {
      return items.map((it) => ({
        ...it,
        catalog_line_total: round2(num(it.price)),
        net_line_total: round2(num(it.price)),
        offer_discount: 0,
        offer_label: null,
        is_item_promo: false,
      }));
    }
    let allocated = 0;
    const formatted = formatMerchantOfferLabel(label, null);
    return items.map((it, i) => {
      const catalog = round2(num(it.price));
      const isLast = i === items.length - 1;
      let share = isLast
        ? round2(Math.max(0, discPoolCustomer - allocated))
        : round2((catalog / weightSum) * discPoolCustomer);
      share = Math.min(share, catalog);
      allocated = round2(allocated + share);
      const isPromo = share > 0.005;
      return {
        ...it,
        catalog_line_total: catalog,
        offer_discount: isPromo ? share : 0,
        net_line_total: round2(Math.max(0, catalog - share)),
        offer_label: isPromo ? formatted : null,
        is_item_promo: isPromo,
      };
    });
  }

  const promoIdx: number[] = [];
  let merchantPromoSum = 0;
  for (let i = 0; i < items.length; i++) {
    const it = items[i]!;
    const mid = it.menu_item_id != null ? String(it.menu_item_id) : "";
    const hit =
      (mid && menuIdAliases(mid).some((a) => promoByAlias.has(a))) ||
      (eligRows[i] != null &&
        (eligRows[i]!.isDiscountEligible === false ||
          eligRows[i]!.is_discount_eligible === false) &&
        String(eligRows[i]!.ineligibilityReason ?? eligRows[i]!.ineligibility_reason) ===
          "ITEM_PROMO");
    if (!hit) continue;
    promoIdx.push(i);
    merchantPromoSum = round2(merchantPromoSum + Math.max(0, num(it.price)));
  }

  if (promoIdx.length === 0 || merchantPromoSum <= 0.005) {
    return items.map((it) => ({
      ...it,
      catalog_line_total: round2(num(it.price)),
      net_line_total: round2(num(it.price)),
      offer_discount: 0,
      offer_label: null,
      is_item_promo: false,
    }));
  }

  const scale =
    customerPromoSum > 0.005
      ? Math.min(1.5, Math.max(0.5, merchantPromoSum / customerPromoSum))
      : 1;
  let merchantDiscPool = round2(discPoolCustomer * scale);
  merchantDiscPool = Math.min(merchantDiscPool, merchantPromoSum);

  const out = items.map((it) => ({ ...it }));
  let allocated = 0;
  for (let k = 0; k < promoIdx.length; k++) {
    const i = promoIdx[k]!;
    const it = out[i]!;
    const catalog = round2(num(it.price));
    const isLast = k === promoIdx.length - 1;
    let share = isLast
      ? round2(Math.max(0, merchantDiscPool - allocated))
      : round2((catalog / merchantPromoSum) * merchantDiscPool);
    share = Math.min(share, catalog);
    allocated = round2(allocated + share);
    out[i] = {
      ...it,
      catalog_line_total: catalog,
      offer_discount: share,
      net_line_total: round2(Math.max(0, catalog - share)),
      offer_label: label,
      is_item_promo: share > 0.005,
    };
  }

  for (let i = 0; i < out.length; i++) {
    if (promoIdx.includes(i)) continue;
    const it = out[i]!;
    const catalog = round2(num(it.price));
    out[i] = {
      ...it,
      catalog_line_total: catalog,
      net_line_total: catalog,
      offer_discount: 0,
      offer_label: null,
      is_item_promo: false,
    };
  }

  return out;
}
