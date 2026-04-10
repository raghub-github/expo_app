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

function nowInWindow(now: Date, startsAt: Date | null, endsAt: Date | null): boolean {
  if (startsAt && now < startsAt) return false;
  if (endsAt && now > endsAt) return false;
  return true;
}

export function platformOfferConditionsPass(
  conditions: Record<string, unknown>,
  ctx: BillContext,
  grossCart: number
): boolean {
  const city = conditions.city;
  if (typeof city === "string" && city.trim() !== "") {
    const want = city.trim().toLowerCase();
    const have = ctx.cityName?.trim().toLowerCase() ?? "";
    if (!have || have !== want) return false;
  }
  const storeId = conditions.merchant_store_id ?? conditions.store_id;
  if (storeId != null && Number(storeId) !== ctx.merchantStoreId) return false;

  const minOrder = num(conditions.min_order_value);
  if (minOrder > 0 && grossCart < minOrder) return false;

  const seg = conditions.user_segment;
  if (seg === "NEW" && ctx.userSegment !== "NEW") return false;
  if (seg === "EXISTING" && ctx.userSegment === "NEW") return false;

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

/** Runs after non-delivery rules: %- or fixed cart discounts from configured GatiMitra offers. */
export function applyPlatformCartOffers(
  ctx: BillContext,
  dataset: BillingDataset,
  state: MutableBillState,
  itemPlusAddon: number,
  rem: FeeRem
): void {
  const grossCart = itemPlusAddon;
  const now = new Date();
  const st = ctx.serviceType || "FOOD";
  const offers = sortedOffers(dataset.platformOffers.filter((o) => o.serviceType === st || o.serviceType === "ALL"));

  let winner: PlatformOfferRow | null = null;
  for (const o of offers) {
    if (!nowInWindow(now, o.startsAt, o.endsAt)) continue;
    if ((o.customerSegment === "NEW" && ctx.userSegment !== "NEW") || (o.customerSegment === "EXISTING" && ctx.userSegment === "NEW")) continue;
    if (o.merchantIds.length > 0 && !o.merchantIds.includes(ctx.merchantStoreId)) continue;

    const cond = (o.conditions ?? {}) as Record<string, unknown>;
    if (!platformOfferConditionsPass(cond, ctx, grossCart)) continue;

    const hasCart =
      (o.discountType === "PERCENTAGE" || o.discountType === "FIXED") && num(o.valueNumeric) > 0;
    if (!hasCart) continue;
    winner = o;
    break;
  }
  if (!winner) return;

  const baseAfterDisc = Math.max(0, rem.items);
  let amt = winner.discountType === "PERCENTAGE" ? (baseAfterDisc * num(winner.valueNumeric)) / 100 : num(winner.valueNumeric);
  if (num(winner.maxDiscountAmount) > 0) amt = Math.min(amt, num(winner.maxDiscountAmount));
  amt = Math.min(Math.max(0, amt), baseAfterDisc);
  if (amt <= 0) return;

  rem.items -= amt;
  state.discountTotal += amt;
  const line: AppliedLine = {
    kind: "discount",
    label: winner.name?.trim() || `GatiMitra offer #${winner.id}`,
    amount: amt,
    hidden: winner.isHidden,
    meta: {
      platformOfferId: winner.id,
      fundingMode: winner.fundingMode,
      platformContribution: (amt * winner.platformSharePct) / 100,
      merchantContribution: (amt * winner.merchantSharePct) / 100,
    },
  };
  state.discounts.push(line);
  state.breakdown_steps.push({ step: line.label, amount: -amt, meta: { platformOfferId: winner.id } });
}

/** Runs after delivery rules: free / discounted delivery from configured offers. */
export function applyPlatformDeliveryOffers(
  ctx: BillContext,
  dataset: BillingDataset,
  state: MutableBillState,
  itemPlusAddon: number,
  rem: FeeRem
): void {
  const grossCart = itemPlusAddon;
  const now = new Date();
  const st = ctx.serviceType || "FOOD";
  const offers = sortedOffers(dataset.platformOffers.filter((o) => o.serviceType === st || o.serviceType === "ALL"));

  let winner: PlatformOfferRow | null = null;
  for (const o of offers) {
    if (!nowInWindow(now, o.startsAt, o.endsAt)) continue;
    if ((o.customerSegment === "NEW" && ctx.userSegment !== "NEW") || (o.customerSegment === "EXISTING" && ctx.userSegment === "NEW")) continue;
    if (o.merchantIds.length > 0 && !o.merchantIds.includes(ctx.merchantStoreId)) continue;
    const dd = (o.deliveryDiscountType ?? "").toUpperCase().trim();
    if (!dd) continue;

    const cond = (o.conditions ?? {}) as Record<string, unknown>;
    if (!platformOfferConditionsPass(cond, ctx, grossCart)) continue;
    winner = o;
    break;
  }
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
    },
  });
}
