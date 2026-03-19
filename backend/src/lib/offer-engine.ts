import { sql } from "drizzle-orm";

// Core types for the unified offer engine. These mirror the JSONB structures
// stored in the offers table created by 0131_merchant_offer_engine_v2.sql.

export type OfferType =
  | "PERCENTAGE_DISCOUNT"
  | "FLAT_DISCOUNT"
  | "COUPON_DISCOUNT"
  | "BUY_N_GET_M"
  | "FREE_ITEM"
  | "FREE_DELIVERY"
  | "COMBO_OFFER"
  | "CASHBACK"
  | "FIRST_ORDER_OFFER"
  | "LOYALTY_BASED";

export type OfferStatus = "DRAFT" | "ACTIVE" | "INACTIVE" | "EXPIRED" | "ARCHIVED";

export type OfferConflictMode = "BEST_VALUE" | "PRIORITY_BASED" | "MERCHANT_CONTROLLED";

export interface OfferConditions {
  min_order_value?: number;
  max_order_value?: number;
  applicable_items?: string[];
  excluded_items?: string[];
  applicable_categories?: string[];
  excluded_categories?: string[];
  first_order_only?: boolean;
  user_segments?: string[];
  order_channel?: string;
  payment_methods?: string[];
  day_of_week?: number[];
  time_slots?: { start: string; end: string }[];
  max_uses_total?: number | null;
  max_uses_per_user?: number | null;
}

export interface PercentageBenefits {
  percentage_value: number;
  max_discount_cap: number;
  apply_on: "ITEM" | "CART";
}

export interface FlatBenefits {
  flat_amount: number;
}

export interface CouponBenefits {
  coupon_code: string;
  discount: PercentageBenefits | FlatBenefits;
}

export interface BuyNGetMBenefits {
  buy_quantity: number;
  get_quantity: number;
  cheapest_free?: boolean;
  mapping?: {
    buy_from_items?: string[];
    get_from_items?: string[];
  };
}

export interface FreeItemBenefits {
  trigger_items: { item_id: string; min_qty: number }[];
  free_items: { item_id: string; qty: number }[];
}

export interface ComboBenefits {
  combo_items: { item_id: string; qty: number }[];
  combo_price?: number;
  discount_percentage?: number;
  flat_amount?: number;
  override_individual_pricing?: boolean;
}

export interface FreeDeliveryBenefits {
  max_delivery_waiver?: number;
  min_order_value?: number;
}

export interface CashbackBenefits {
  cashback_type: "WALLET" | "LOYALTY";
  value_type: "PERCENTAGE" | "FLAT";
  value: number;
  max_cashback_cap?: number;
}

export interface FirstOrderBenefits {
  // First order mostly uses conditions; keep placeholder for future.
}

export interface LoyaltyBenefits {
  loyalty_multiplier?: number;
  extra_discount_percentage?: number;
}

export type OfferBenefits =
  | PercentageBenefits
  | FlatBenefits
  | CouponBenefits
  | BuyNGetMBenefits
  | FreeItemBenefits
  | ComboBenefits
  | FreeDeliveryBenefits
  | CashbackBenefits
  | FirstOrderBenefits
  | LoyaltyBenefits;

export interface OfferRecord {
  id: number;
  store_id: number | null;
  type: OfferType;
  subtype: string | null;
  conditions: OfferConditions;
  benefits: OfferBenefits;
  priority: number;
  stackable: boolean;
  combinable_with: string[];
  max_offers_per_order: number;
  usage_limit_total: number | null;
  usage_limit_per_user: number | null;
  valid_from: string;
  valid_till: string;
  status: OfferStatus;
  stacking_policy: OfferConflictMode;
  metadata: Record<string, unknown>;
}

export interface CartItemInput {
  line_id: string;
  item_id: string;
  category_id?: string | null;
  quantity: number;
  unit_price: number;
}

export interface CartContext {
  store_id: number;
  user_id?: number | null;
  channel: string;
  coupon_codes?: string[];
  now?: Date;
}

export interface AppliedOfferLine {
  line_id: string;
  offer_id: number;
  amount: number;
}

export interface AppliedOfferSummary {
  offer_id: number;
  type: OfferType;
  code?: string;
  total_discount: number;
  cashback_amount: number;
}

export interface OfferEngineResult {
  subtotal: number;
  delivery_fee: number;
  total_discount: number;
  delivery_discount: number;
  payable_amount: number;
  cashback_total: number;
  applied_offers: AppliedOfferSummary[];
  line_discounts: AppliedOfferLine[];
  trace: unknown;
}

export interface LoadedOffers {
  offers: OfferRecord[];
}

export interface OfferEngineDependencies {
  loadOffersForCart: (ctx: CartContext, itemIds: string[]) => Promise<LoadedOffers>;
  isFirstOrderForUser: (userId: number, storeId: number) => Promise<boolean>;
  getUserLoyaltySnapshot: (userId: number) => Promise<{ points: number; tier?: string } | null>;
}

export class OfferEngine {
  private readonly deps: OfferEngineDependencies;

  constructor(deps: OfferEngineDependencies) {
    this.deps = deps;
  }

  async evaluateCart(
    items: CartItemInput[],
    deliveryFee: number,
    ctx: CartContext
  ): Promise<OfferEngineResult> {
    const normalizedNow = ctx.now ?? new Date();
    const subtotal = items.reduce((sum, it) => sum + it.unit_price * it.quantity, 0);

    if (!items.length) {
      return {
        subtotal,
        delivery_fee: deliveryFee,
        total_discount: 0,
        delivery_discount: 0,
        payable_amount: subtotal + deliveryFee,
        cashback_total: 0,
        applied_offers: [],
        line_discounts: [],
        trace: { steps: [], reason: "EMPTY_CART" },
      };
    }

    const itemIds = Array.from(new Set(items.map((i) => i.item_id)));
    const { offers } = await this.deps.loadOffersForCart(ctx, itemIds);

    const eligibleOffers = await this.filterEligibleOffers(offers, items, ctx, normalizedNow, subtotal);

    // Deterministic ordering: by priority asc, then id asc
    const ordered = eligibleOffers.sort((a, b) => {
      if (a.priority !== b.priority) return a.priority - b.priority;
      return a.id - b.id;
    });

    const state = {
      items: items.map((it) => ({ ...it })),
      subtotal,
      deliveryFee,
      discounts: [] as AppliedOfferLine[],
      appliedSummaries: [] as AppliedOfferSummary[],
      deliveryDiscount: 0,
      cashbackTotal: 0,
      appliedOfferIds: new Set<number>(),
      steps: [] as unknown[],
    };

    for (const offer of ordered) {
      this.applyOfferWithStacking(state, offer, ctx);
    }

    const totalDiscount =
      state.discounts.reduce((sum, d) => sum + d.amount, 0) + state.deliveryDiscount;
    const payable = Math.max(0, subtotal + deliveryFee - totalDiscount);

    return {
      subtotal,
      delivery_fee: deliveryFee,
      total_discount: totalDiscount,
      delivery_discount: state.deliveryDiscount,
      payable_amount: payable,
      cashback_total: state.cashbackTotal,
      applied_offers: state.appliedSummaries,
      line_discounts: state.discounts,
      trace: {
        steps: state.steps,
        offers_considered: ordered.map((o) => o.id),
      },
    };
  }

  private async filterEligibleOffers(
    offers: OfferRecord[],
    items: CartItemInput[],
    ctx: CartContext,
    now: Date,
    subtotal: number
  ): Promise<OfferRecord[]> {
    const out: OfferRecord[] = [];
    const day = now.getUTCDay();
    const timeStr = now.toISOString().slice(11, 19);
    const totalQtyByItem = items.reduce<Record<string, number>>((acc, it) => {
      acc[it.item_id] = (acc[it.item_id] ?? 0) + it.quantity;
      return acc;
    }, {});

    const firstOrderCache = new Map<number, boolean>();

    for (const offer of offers) {
      if (offer.status !== "ACTIVE") continue;
      const from = new Date(offer.valid_from);
      const till = new Date(offer.valid_till);
      if (now < from || now > till) continue;

      const cond = offer.conditions ?? {};

      if (cond.min_order_value != null && subtotal < cond.min_order_value) continue;
      if (cond.max_order_value != null && subtotal > cond.max_order_value) continue;

      if (cond.day_of_week && cond.day_of_week.length > 0 && !cond.day_of_week.includes(day)) {
        continue;
      }

      if (cond.time_slots && cond.time_slots.length > 0) {
        const withinSlot = cond.time_slots.some(
          (slot) => timeStr >= slot.start && timeStr <= slot.end
        );
        if (!withinSlot) continue;
      }

      if (cond.order_channel && cond.order_channel !== ctx.channel) continue;

      if (cond.first_order_only) {
        const userId = ctx.user_id ?? null;
        if (!userId) continue;
        let isFirst = firstOrderCache.get(userId);
        if (isFirst === undefined) {
          isFirst = await this.deps.isFirstOrderForUser(userId, ctx.store_id);
          firstOrderCache.set(userId, isFirst);
        }
        if (!isFirst) continue;
      }

      if (offer.type === "COUPON_DISCOUNT") {
        const code =
          (offer.benefits as CouponBenefits | undefined)?.coupon_code?.toUpperCase() ?? "";
        if (!code) continue;
        const provided = (ctx.coupon_codes ?? []).map((c) => c.toUpperCase());
        if (!provided.includes(code)) continue;
      }

      if (cond.applicable_items && cond.applicable_items.length > 0) {
        const anyMatch = cond.applicable_items.some((id) => totalQtyByItem[id] && totalQtyByItem[id] > 0);
        if (!anyMatch) continue;
      }

      if (cond.excluded_items && cond.excluded_items.length > 0) {
        const hasExcluded = items.some((it) => cond.excluded_items!.includes(it.item_id));
        if (hasExcluded) continue;
      }

      out.push(offer);
    }

    return out;
  }

  private applyOfferWithStacking(
    state: {
      items: CartItemInput[];
      subtotal: number;
      deliveryFee: number;
      discounts: AppliedOfferLine[];
      appliedSummaries: AppliedOfferSummary[];
      deliveryDiscount: number;
      cashbackTotal: number;
      appliedOfferIds: Set<number>;
      steps: unknown[];
    },
    offer: OfferRecord,
    ctx: CartContext
  ): void {
    if (!offer.stackable && state.appliedOfferIds.size > 0) {
      state.steps.push({ offer_id: offer.id, skipped: true, reason: "NON_STACKABLE" });
      return;
    }

    const type = offer.type;
    const beforeTotalDiscount =
      state.discounts.reduce((s, d) => s + d.amount, 0) + state.deliveryDiscount;

    switch (type) {
      case "PERCENTAGE_DISCOUNT":
        this.applyPercentageOffer(state, offer);
        break;
      case "FLAT_DISCOUNT":
        this.applyFlatOffer(state, offer);
        break;
      case "COUPON_DISCOUNT":
        this.applyCouponOffer(state, offer);
        break;
      case "BUY_N_GET_M":
        this.applyBuyNGetMOffer(state, offer);
        break;
      case "FREE_ITEM":
        this.applyFreeItemOffer(state, offer);
        break;
      case "FREE_DELIVERY":
        this.applyFreeDeliveryOffer(state, offer);
        break;
      case "COMBO_OFFER":
        this.applyComboOffer(state, offer);
        break;
      case "CASHBACK":
        this.applyCashbackOffer(state, offer);
        break;
      case "FIRST_ORDER_OFFER":
        this.applyFirstOrderOffer(state, offer);
        break;
      case "LOYALTY_BASED":
        this.applyLoyaltyOffer(state, offer, ctx);
        break;
      default:
        state.steps.push({ offer_id: offer.id, skipped: true, reason: "UNKNOWN_TYPE" });
        return;
    }

    const afterTotalDiscount =
      state.discounts.reduce((s, d) => s + d.amount, 0) + state.deliveryDiscount;
    const delta = afterTotalDiscount - beforeTotalDiscount;

    if (delta > 0 || state.cashbackTotal > 0) {
      state.appliedOfferIds.add(offer.id);
      const summaryIdx = state.appliedSummaries.findIndex((s) => s.offer_id === offer.id);
      if (summaryIdx >= 0) {
        state.appliedSummaries[summaryIdx].total_discount += delta;
      } else {
        state.appliedSummaries.push({
          offer_id: offer.id,
          type: offer.type,
          total_discount: delta,
          cashback_amount: 0,
        });
      }
      state.steps.push({ offer_id: offer.id, applied: true, delta });
    } else {
      state.steps.push({ offer_id: offer.id, skipped: true, reason: "NO_BENEFIT" });
    }
  }

  private applyPercentageOffer(
    state: {
      items: CartItemInput[];
      subtotal: number;
      deliveryFee: number;
      discounts: AppliedOfferLine[];
      appliedSummaries: AppliedOfferSummary[];
      deliveryDiscount: number;
      cashbackTotal: number;
      appliedOfferIds: Set<number>;
      steps: unknown[];
    },
    offer: OfferRecord
  ): void {
    const b = offer.benefits as PercentageBenefits;
    if (!b || typeof b.percentage_value !== "number" || typeof b.max_discount_cap !== "number") {
      state.steps.push({ offer_id: offer.id, skipped: true, reason: "INVALID_PERCENTAGE_BENEFITS" });
      return;
    }
    if (b.percentage_value <= 0 || b.percentage_value > 100 || b.max_discount_cap <= 0) {
      state.steps.push({ offer_id: offer.id, skipped: true, reason: "OUT_OF_RANGE_PERCENTAGE" });
      return;
    }

    const targetItems = state.items;
    const targetSubtotal = targetItems.reduce(
      (sum, it) => sum + it.unit_price * it.quantity,
      0
    );
    if (targetSubtotal <= 0) return;

    let discount = (targetSubtotal * b.percentage_value) / 100;
    if (discount > b.max_discount_cap) discount = b.max_discount_cap;

    if (discount <= 0) return;

    let remaining = discount;
    for (const it of targetItems) {
      const lineTotal = it.unit_price * it.quantity;
      if (lineTotal <= 0) continue;
      const share = (lineTotal / targetSubtotal) * discount;
      const lineAmount = Math.min(remaining, Math.round(share * 100) / 100);
      if (lineAmount > 0) {
        state.discounts.push({
          line_id: it.line_id,
          offer_id: offer.id,
          amount: lineAmount,
        });
        remaining -= lineAmount;
      }
    }
  }

  private applyFlatOffer(
    state: {
      items: CartItemInput[];
      subtotal: number;
      deliveryFee: number;
      discounts: AppliedOfferLine[];
      appliedSummaries: AppliedOfferSummary[];
      deliveryDiscount: number;
      cashbackTotal: number;
      appliedOfferIds: Set<number>;
      steps: unknown[];
    },
    offer: OfferRecord
  ): void {
    const b = offer.benefits as FlatBenefits;
    const cond = offer.conditions;
    if (!b || typeof b.flat_amount !== "number" || b.flat_amount <= 0) {
      state.steps.push({ offer_id: offer.id, skipped: true, reason: "INVALID_FLAT_BENEFITS" });
      return;
    }
    if (cond.min_order_value == null || b.flat_amount >= cond.min_order_value) {
      state.steps.push({ offer_id: offer.id, skipped: true, reason: "FLAT_GT_MIN_ORDER" });
      return;
    }

    if (state.subtotal < cond.min_order_value) {
      state.steps.push({ offer_id: offer.id, skipped: true, reason: "BELOW_MIN_ORDER" });
      return;
    }

    const discount = Math.min(b.flat_amount, state.subtotal);
    if (discount <= 0) return;

    const total = state.items.reduce((sum, it) => sum + it.unit_price * it.quantity, 0);
    if (total <= 0) return;

    let remaining = discount;
    for (const it of state.items) {
      const lineTotal = it.unit_price * it.quantity;
      if (lineTotal <= 0) continue;
      const share = (lineTotal / total) * discount;
      const lineAmount = Math.min(remaining, Math.round(share * 100) / 100);
      if (lineAmount > 0) {
        state.discounts.push({
          line_id: it.line_id,
          offer_id: offer.id,
          amount: lineAmount,
        });
        remaining -= lineAmount;
      }
    }
  }

  private applyCouponOffer(
    state: {
      items: CartItemInput[];
      subtotal: number;
      deliveryFee: number;
      discounts: AppliedOfferLine[];
      appliedSummaries: AppliedOfferSummary[];
      deliveryDiscount: number;
      cashbackTotal: number;
      appliedOfferIds: Set<number>;
      steps: unknown[];
    },
    offer: OfferRecord
  ): void {
    const b = offer.benefits as CouponBenefits;
    if (!b || !b.coupon_code || !b.discount) {
      state.steps.push({ offer_id: offer.id, skipped: true, reason: "INVALID_COUPON_BENEFITS" });
      return;
    }

    const inner = b.discount as PercentageBenefits | FlatBenefits;
    if ((inner as PercentageBenefits).percentage_value != null) {
      this.applyPercentageOffer(state, {
        ...offer,
        benefits: inner as PercentageBenefits,
      });
    } else if ((inner as FlatBenefits).flat_amount != null) {
      this.applyFlatOffer(state, {
        ...offer,
        benefits: inner as FlatBenefits,
      });
    } else {
      state.steps.push({ offer_id: offer.id, skipped: true, reason: "UNSUPPORTED_COUPON_DISCOUNT" });
    }
  }

  private applyBuyNGetMOffer(
    state: {
      items: CartItemInput[];
      subtotal: number;
      deliveryFee: number;
      discounts: AppliedOfferLine[];
      appliedSummaries: AppliedOfferSummary[];
      deliveryDiscount: number;
      cashbackTotal: number;
      appliedOfferIds: Set<number>;
      steps: unknown[];
    },
    offer: OfferRecord
  ): void {
    const b = offer.benefits as BuyNGetMBenefits;
    if (!b || b.buy_quantity <= 0 || b.get_quantity <= 0) {
      state.steps.push({ offer_id: offer.id, skipped: true, reason: "INVALID_BUY_N_GET_M" });
      return;
    }

    const eligibleItems = state.items;
    const quantities: { item: CartItemInput; remainingQty: number }[] = eligibleItems.map(
      (it) => ({ item: it, remainingQty: it.quantity })
    );

    let totalDiscount = 0;
    const cheapestFree = b.cheapest_free !== false;

    while (true) {
      const totalBuyable = quantities.reduce((sum, q) => sum + q.remainingQty, 0);
      if (totalBuyable < b.buy_quantity + b.get_quantity) break;

      let groupDiscount = 0;
      if (cheapestFree) {
        const expanded: { price: number; idx: number }[] = [];
        quantities.forEach((q, idx) => {
          for (let i = 0; i < q.remainingQty; i++) {
            expanded.push({ price: q.item.unit_price, idx });
          }
        });
        expanded.sort((a, b2) => a.price - b2.price);
        const freebies = expanded.slice(0, b.get_quantity);
        for (const f of freebies) {
          groupDiscount += f.price;
          quantities[f.idx].remainingQty -= 1;
        }
        let remainingToConsume = b.buy_quantity;
        for (const q of quantities) {
          const used = Math.min(q.remainingQty, remainingToConsume);
          q.remainingQty -= used;
          remainingToConsume -= used;
          if (remainingToConsume <= 0) break;
        }
      }

      if (groupDiscount <= 0) break;
      totalDiscount += groupDiscount;
    }

    if (totalDiscount <= 0) return;

    const total = state.items.reduce((sum, it) => sum + it.unit_price * it.quantity, 0);
    if (total <= 0) return;

    let remaining = totalDiscount;
    for (const it of state.items) {
      const lineTotal = it.unit_price * it.quantity;
      if (lineTotal <= 0) continue;
      const share = (lineTotal / total) * totalDiscount;
      const lineAmount = Math.min(remaining, Math.round(share * 100) / 100);
      if (lineAmount > 0) {
        state.discounts.push({
          line_id: it.line_id,
          offer_id: offer.id,
          amount: lineAmount,
        });
        remaining -= lineAmount;
      }
    }
  }

  private applyFreeItemOffer(
    state: {
      items: CartItemInput[];
      subtotal: number;
      deliveryFee: number;
      discounts: AppliedOfferLine[];
      appliedSummaries: AppliedOfferSummary[];
      deliveryDiscount: number;
      cashbackTotal: number;
      appliedOfferIds: Set<number>;
      steps: unknown[];
    },
    offer: OfferRecord
  ): void {
    const b = offer.benefits as FreeItemBenefits;
    if (!b || !Array.isArray(b.trigger_items) || !Array.isArray(b.free_items)) {
      state.steps.push({ offer_id: offer.id, skipped: true, reason: "INVALID_FREE_ITEM" });
      return;
    }

    for (const trigger of b.trigger_items) {
      const triggerItem = state.items.find((it) => it.item_id === trigger.item_id);
      if (!triggerItem || triggerItem.quantity < trigger.min_qty) {
        state.steps.push({
          offer_id: offer.id,
          skipped: true,
          reason: "TRIGGER_NOT_MET",
        });
        return;
      }
    }

    let totalDiscount = 0;
    for (const free of b.free_items) {
      const target = state.items.find((it) => it.item_id === free.item_id);
      if (!target) continue;
      const qty = Math.min(target.quantity, free.qty);
      const value = target.unit_price * qty;
      totalDiscount += value;
    }

    if (totalDiscount <= 0) return;

    let remaining = totalDiscount;
    for (const free of b.free_items) {
      const target = state.items.find((it) => it.item_id === free.item_id);
      if (!target) continue;
      const qty = Math.min(target.quantity, free.qty);
      const value = target.unit_price * qty;
      const amount = Math.min(remaining, value);
      if (amount > 0) {
        state.discounts.push({
          line_id: target.line_id,
          offer_id: offer.id,
          amount,
        });
        remaining -= amount;
      }
    }
  }

  private applyFreeDeliveryOffer(
    state: {
      items: CartItemInput[];
      subtotal: number;
      deliveryFee: number;
      discounts: AppliedOfferLine[];
      appliedSummaries: AppliedOfferSummary[];
      deliveryDiscount: number;
      cashbackTotal: number;
      appliedOfferIds: Set<number>;
      steps: unknown[];
    },
    offer: OfferRecord
  ): void {
    const b = offer.benefits as FreeDeliveryBenefits;
    if (state.deliveryFee <= 0) {
      state.steps.push({ offer_id: offer.id, skipped: true, reason: "NO_DELIVERY_FEE" });
      return;
    }
    if (b.min_order_value != null && state.subtotal < b.min_order_value) {
      state.steps.push({ offer_id: offer.id, skipped: true, reason: "BELOW_MIN_FOR_FREE_DELIVERY" });
      return;
    }

    let waiver = state.deliveryFee;
    if (b.max_delivery_waiver != null && b.max_delivery_waiver > 0) {
      waiver = Math.min(waiver, b.max_delivery_waiver);
    }
    if (waiver <= 0) return;
    state.deliveryDiscount += waiver;
  }

  private applyComboOffer(
    state: {
      items: CartItemInput[];
      subtotal: number;
      deliveryFee: number;
      discounts: AppliedOfferLine[];
      appliedSummaries: AppliedOfferSummary[];
      deliveryDiscount: number;
      cashbackTotal: number;
      appliedOfferIds: Set<number>;
      steps: unknown[];
    },
    offer: OfferRecord
  ): void {
    const b = offer.benefits as ComboBenefits;
    if (!b || !Array.isArray(b.combo_items) || b.combo_items.length === 0) {
      state.steps.push({ offer_id: offer.id, skipped: true, reason: "INVALID_COMBO" });
      return;
    }

    let maxCombos = Infinity;
    let comboFullPrice = 0;
    for (const c of b.combo_items) {
      const item = state.items.find((it) => it.item_id === c.item_id);
      if (!item || item.quantity < c.qty) {
        maxCombos = 0;
        break;
      }
      const possible = Math.floor(item.quantity / c.qty);
      if (possible < maxCombos) maxCombos = possible;
      comboFullPrice += item.unit_price * c.qty;
    }

    if (!Number.isFinite(maxCombos) || maxCombos <= 0) {
      state.steps.push({ offer_id: offer.id, skipped: true, reason: "NO_FULL_COMBO" });
      return;
    }

    let discountPerCombo = 0;
    if (b.combo_price != null) {
      discountPerCombo = Math.max(0, comboFullPrice - b.combo_price);
    } else if (b.discount_percentage != null) {
      discountPerCombo = (comboFullPrice * b.discount_percentage) / 100;
    } else if (b.flat_amount != null) {
      discountPerCombo = b.flat_amount;
    }

    if (discountPerCombo <= 0) {
      state.steps.push({ offer_id: offer.id, skipped: true, reason: "NO_COMBO_DISCOUNT" });
      return;
    }

    const totalDiscount = discountPerCombo * maxCombos;
    if (totalDiscount <= 0) return;

    const comboItemIds = new Set(b.combo_items.map((c) => c.item_id));
    const comboLines = state.items.filter((it) => comboItemIds.has(it.item_id));
    const comboSubtotal = comboLines.reduce(
      (sum, it) => sum + it.unit_price * it.quantity,
      0
    );
    if (comboSubtotal <= 0) return;

    let remaining = totalDiscount;
    for (const it of comboLines) {
      const lineTotal = it.unit_price * it.quantity;
      if (lineTotal <= 0) continue;
      const share = (lineTotal / comboSubtotal) * totalDiscount;
      const lineAmount = Math.min(remaining, Math.round(share * 100) / 100);
      if (lineAmount > 0) {
        state.discounts.push({
          line_id: it.line_id,
          offer_id: offer.id,
          amount: lineAmount,
        });
        remaining -= lineAmount;
      }
    }
  }

  private applyCashbackOffer(
    state: {
      items: CartItemInput[];
      subtotal: number;
      deliveryFee: number;
      discounts: AppliedOfferLine[];
      appliedSummaries: AppliedOfferSummary[];
      deliveryDiscount: number;
      cashbackTotal: number;
      appliedOfferIds: Set<number>;
      steps: unknown[];
    },
    offer: OfferRecord
  ): void {
    const b = offer.benefits as CashbackBenefits;
    if (!b || b.value <= 0) {
      state.steps.push({ offer_id: offer.id, skipped: true, reason: "INVALID_CASHBACK" });
      return;
    }

    let cashback = 0;
    if (b.value_type === "PERCENTAGE") {
      cashback = (state.subtotal * b.value) / 100;
    } else {
      cashback = b.value;
    }
    if (b.max_cashback_cap != null && b.max_cashback_cap > 0) {
      cashback = Math.min(cashback, b.max_cashback_cap);
    }
    if (cashback <= 0) return;

    state.cashbackTotal += cashback;
  }

  private applyFirstOrderOffer(
    _state: {
      items: CartItemInput[];
      subtotal: number;
      deliveryFee: number;
      discounts: AppliedOfferLine[];
      appliedSummaries: AppliedOfferSummary[];
      deliveryDiscount: number;
      cashbackTotal: number;
      appliedOfferIds: Set<number>;
      steps: unknown[];
    },
    _offer: OfferRecord
  ): void {
  }

  private applyLoyaltyOffer(
    _state: {
      items: CartItemInput[];
      subtotal: number;
      deliveryFee: number;
      discounts: AppliedOfferLine[];
      appliedSummaries: AppliedOfferSummary[];
      deliveryDiscount: number;
      cashbackTotal: number;
      appliedOfferIds: Set<number>;
      steps: unknown[];
    },
    _offer: OfferRecord,
    _ctx: CartContext
  ): void {
  }
}

