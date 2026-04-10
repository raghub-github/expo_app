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

/** Subtotal for lines whose menu item id is in allowed (empty allowed = full cart). */
function eligibleSubtotal(ctx: BillContext, offer: MerchantOfferRow, grossCart: number): number {
  const meta = offer.metadata ?? {};
  const raw = meta.menu_item_ids ?? meta.menuItemIds;
  if (!Array.isArray(raw) || raw.length === 0) return grossCart;
  const allow = new Set(raw.map(normalizeMenuId));
  let sum = 0;
  for (const line of ctx.orderLines ?? []) {
    if (allow.has(normalizeMenuId(line.menuItemId))) {
      sum += line.lineTotal;
    }
  }
  return sum;
}

/**
 * Store-created offers from `merchant_offers` (item mapping in offer_metadata.menu_item_ids).
 * Runs after pricing rules, before GatiMitra platform offers.
 */
export function applyMerchantStoreOffers(
  ctx: BillContext,
  dataset: BillingDataset,
  state: MutableBillState,
  itemPlusAddon: number,
  rem: FeeRem
): void {
  const grossCart = itemPlusAddon;
  const offers = [...dataset.merchantOffers].sort((a, b) => b.displayPriority - a.displayPriority || a.id - b.id);

  for (const o of offers) {
    if (o.offerType === "COUPON") continue;
    const minOrder = o.minOrderAmount ?? 0;
    if (minOrder > 0 && grossCart < minOrder) continue;

    const base = eligibleSubtotal(ctx, o, grossCart);
    if (base <= 0) continue;

    const poolAfterRules = Math.max(0, rem.items);
    const share = grossCart > 0 ? base / grossCart : 0;
    const afterDiscBase = poolAfterRules * share;
    let amt = 0;
    const t = (o.offerType ?? "").toUpperCase();
    if (t === "PERCENTAGE" || t === "PERCENT") {
      const pct = num(o.discountPercentage);
      if (pct <= 0) continue;
      amt = (afterDiscBase * pct) / 100;
    } else if (t === "FLAT" || t === "FIXED") {
      amt = num(o.discountValue);
    } else {
      continue;
    }

    const cap = o.maxDiscountAmount ?? 0;
    if (cap > 0) amt = Math.min(amt, cap);
    amt = Math.min(Math.max(0, amt), afterDiscBase);
    if (amt <= 0) continue;

    rem.items -= amt;
    state.discountTotal += amt;
    const line: AppliedLine = {
      kind: "discount",
      label: o.title.trim() || `Merchant offer #${o.id}`,
      amount: amt,
      hidden: false,
      meta: { merchantOfferId: o.id, source: "merchant_offers" },
    };
    state.discounts.push(line);
    state.breakdown_steps.push({
      step: line.label,
      amount: -amt,
      meta: { merchantOfferId: o.id },
    });
  }
}
