import type { PlatformOfferKind } from "@/lib/billing/platformOfferKinds";

/** Which major blocks appear in the platform offer builder for a given kind. */
export type PlatformOfferKindSections = {
  showCartDiscount: boolean;
  showDeliveryBlock: boolean;
  showBuyXGetYFields: boolean;
  showFreeMenuFields: boolean;
  showExclusionGroup: boolean;
  /** Labels for cart/value row when it targets a fee bucket in checkout. */
  cartBlockTitle: string;
  cartValueHint: string;
  /** Optional callout under Offer kind. */
  kindNotice?: string;
};

const CART_LIKE: PlatformOfferKind[] = [
  "DISCOUNT",
  "FLAT_DISCOUNT",
  "CASHBACK",
  "LOYALTY_REWARD",
  "FLASH_SALE",
  "BUNDLE_DISCOUNT",
  "COUPON",
];

const FEE_KINDS: Record<
  string,
  { title: string; hint: string }
> = {
  PACKAGING_DISCOUNT: {
    title: "Packaging fee discount",
    hint: "Percent or fixed amount off the packaging fee (after charge rules). Max cap applies to this discount.",
  },
  SURGE_DISCOUNT: {
    title: "Surge fee discount",
    hint: "Percent or fixed amount off the surge fee (after charge rules).",
  },
  SMALL_ORDER_FEE_OFF: {
    title: "Small-order fee discount",
    hint: "Percent or fixed amount off the small-order fee (after charge rules).",
  },
  CONVENIENCE_FEE_OFF: {
    title: "Convenience fee discount",
    hint: "Percent or fixed amount off the convenience fee (after charge rules).",
  },
};

function isCartLike(kind: string): boolean {
  return CART_LIKE.includes(kind as PlatformOfferKind);
}

function isFeeKind(kind: string): kind is keyof typeof FEE_KINDS {
  return kind in FEE_KINDS;
}

export function getPlatformOfferKindSections(offerKind: string): PlatformOfferKindSections {
  const k = (offerKind || "DISCOUNT").toUpperCase();

  if (k === "FREE_DELIVERY") {
    return {
      showCartDiscount: false,
      showDeliveryBlock: true,
      showBuyXGetYFields: false,
      showFreeMenuFields: false,
      showExclusionGroup: false,
      cartBlockTitle: "Cart (items subtotal)",
      cartValueHint: "",
      kindNotice: "This kind uses the delivery block only. Checkout promo codes are created under Checkout coupon.",
    };
  }

  if (k === "BUY_X_GET_Y") {
    return {
      showCartDiscount: true,
      showDeliveryBlock: true,
      showBuyXGetYFields: true,
      showFreeMenuFields: false,
      showExclusionGroup: true,
      cartBlockTitle: "Discount on “get” items",
      cartValueHint:
        "After buy quantity is met, this percent or fixed amount applies to the subtotal of the cheapest get-quantity units (eligible lines only if menu IDs are set).",
      kindNotice: "Requires buy qty and get qty. Optional menu item IDs limit which lines count.",
    };
  }

  if (k === "FREE_MENU_ITEM") {
    return {
      showCartDiscount: false,
      showDeliveryBlock: true,
      showBuyXGetYFields: false,
      showFreeMenuFields: true,
      showExclusionGroup: false,
      cartBlockTitle: "Cart (items subtotal)",
      cartValueHint: "",
      kindNotice:
        "Set menu item IDs and free quantity. Checkout waives the cheapest eligible units (100% of their subtotal) up to that count.",
    };
  }

  if (k === "SUBSCRIPTION_BENEFIT") {
    return {
      showCartDiscount: true,
      showDeliveryBlock: true,
      showBuyXGetYFields: false,
      showFreeMenuFields: false,
      showExclusionGroup: true,
      cartBlockTitle: "Cart (items subtotal)",
      cartValueHint: "Applied only when the billing request has subscription opt-in.",
      kindNotice: "Only applies at checkout when subscriptionOptIn is true on the calculate request.",
    };
  }

  if (isFeeKind(k)) {
    const f = FEE_KINDS[k];
    return {
      showCartDiscount: true,
      showDeliveryBlock: false,
      showBuyXGetYFields: false,
      showFreeMenuFields: false,
      showExclusionGroup: true,
      cartBlockTitle: f.title,
      cartValueHint: f.hint,
    };
  }

  if (k === "COUPON") {
    return {
      showCartDiscount: true,
      showDeliveryBlock: true,
      showBuyXGetYFields: false,
      showFreeMenuFields: false,
      showExclusionGroup: true,
      cartBlockTitle: "Cart (items subtotal)",
      cartValueHint: "",
      kindNotice:
        "Platform-offer “COUPON” is a cart classification. For typed promo codes at checkout, use Checkout coupon in this page.",
    };
  }

  if (isCartLike(k)) {
    return {
      showCartDiscount: true,
      showDeliveryBlock: true,
      showBuyXGetYFields: false,
      showFreeMenuFields: false,
      showExclusionGroup: true,
      cartBlockTitle: "Cart (items subtotal)",
      cartValueHint: "",
    };
  }

  return {
    showCartDiscount: true,
    showDeliveryBlock: true,
    showBuyXGetYFields: false,
    showFreeMenuFields: false,
    showExclusionGroup: true,
    cartBlockTitle: "Cart (items subtotal)",
    cartValueHint: "",
  };
}

export function validatePlatformOfferKindForm(args: {
  offerKind: string;
  buyQtyStr: string;
  getQtyStr: string;
  menuItemIdsStr: string;
  valueNumeric: number | null;
}): string | null {
  const k = (args.offerKind || "DISCOUNT").toUpperCase();

  if (k === "BUY_X_GET_Y") {
    const b = parseInt(String(args.buyQtyStr).trim(), 10);
    const g = parseInt(String(args.getQtyStr).trim(), 10);
    if (!Number.isInteger(b) || b < 1) return "Buy quantity (X) must be a whole number ≥ 1.";
    if (!Number.isInteger(g) || g < 1) return "Get quantity (Y) must be a whole number ≥ 1.";
    if (args.valueNumeric == null || args.valueNumeric <= 0) return "Set a cart discount value for the get portion (percent or fixed).";
  }

  if (k === "FREE_MENU_ITEM") {
    const g = parseInt(String(args.getQtyStr).trim(), 10);
    if (!Number.isInteger(g) || g < 1) return "Free quantity must be a whole number ≥ 1.";
    const ids = args.menuItemIdsStr
      .split(/[\s,]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (ids.length === 0) return "FREE MENU ITEM requires at least one menu item ID.";
  }

  if (k === "FREE_DELIVERY") {
    /* delivery type validated elsewhere; allow empty cart value */
  }

  return null;
}

/** Server/API validation: full body (POST) or merged row (PATCH). */
export function validatePlatformOfferKindFieldsForApi(d: {
  offer_kind?: string;
  buy_qty?: number | null;
  get_qty?: number | null;
  conditions?: Record<string, unknown>;
  discount_type?: string;
  value_numeric?: number | null;
  delivery_discount_type?: string | null;
}): string | null {
  const cond = d.conditions ?? {};
  const menuStr = Array.isArray(cond.menu_item_ids)
    ? (cond.menu_item_ids as unknown[]).map((x) => String(x)).join(",")
    : "";
  const formErr = validatePlatformOfferKindForm({
    offerKind: d.offer_kind ?? "DISCOUNT",
    buyQtyStr: d.buy_qty != null ? String(d.buy_qty) : "",
    getQtyStr: d.get_qty != null ? String(d.get_qty) : "",
    menuItemIdsStr: menuStr,
    valueNumeric: d.value_numeric ?? null,
  });
  if (formErr) return formErr;
  const k = (d.offer_kind ?? "DISCOUNT").toUpperCase();
  if (k === "FREE_DELIVERY") {
    const t = String(d.delivery_discount_type ?? "").trim();
    if (!t) return "FREE_DELIVERY requires delivery_discount_type.";
  }
  const feeKinds = [
    "PACKAGING_DISCOUNT",
    "SURGE_DISCOUNT",
    "SMALL_ORDER_FEE_OFF",
    "CONVENIENCE_FEE_OFF",
  ] as const;
  if (feeKinds.includes(k as (typeof feeKinds)[number])) {
    if (d.value_numeric == null || d.value_numeric <= 0) {
      return `${k} requires a positive value_numeric.`;
    }
    const dt = String(d.discount_type ?? "").toUpperCase();
    if (dt !== "PERCENTAGE" && dt !== "FIXED") {
      return `${k} requires discount_type PERCENTAGE or FIXED.`;
    }
  }
  return null;
}

export function feeKindTableLabel(offerKind: string): string {
  const k = (offerKind || "").toUpperCase();
  if (isFeeKind(k)) return k.replace(/_/g, " ");
  return "—";
}
