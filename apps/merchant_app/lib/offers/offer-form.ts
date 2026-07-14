import type { Offer, OfferType } from "@/services/offersApi";
import { toLocalDateInputValue, normalizeTimeColumnForInput } from "@/lib/offers/offer-utils";
import { formatOfferTypeLabel } from "@/lib/offers/offer-lifecycle";
import { formatOfferInr } from "@/lib/offers/offer-analytics";
import {
  OFFER_NAV_STEPS,
  OFFER_STEP_LABELS,
  OFFER_WIZARD_STEPS,
  DISCOUNT_SLIDER_MIN,
  type OfferWizardStep,
  type OfferCreatePath,
} from "@/lib/offers/offer-form-constants";

export type { OfferWizardStep, OfferCreatePath };
export { OFFER_NAV_STEPS, OFFER_STEP_LABELS, OFFER_WIZARD_STEPS };

/** Progress bar steps after choose (create) or from start when editing. */
export const WIZARD_STEPS: { id: OfferWizardStep; label: string }[] = OFFER_WIZARD_STEPS.map(
  (id) => ({ id, label: OFFER_STEP_LABELS[id] })
);

export type OfferFormValues = {
  title: string;
  description: string;
  offerType: OfferType;
  discountValue: string;
  minOrder: string;
  maxOrder: string;
  couponCode: string;
  buyQty: string;
  getQty: string;
  validFrom: string;
  validTill: string;
  autoApply: boolean;
  maxDiscountAmount: string;
  maxUsesTotal: string;
  maxUsesPerUser: string;
  firstOrderOnly: boolean;
  newUserOnly: boolean;
  isActive: boolean;
  isStackable: boolean;
  priority: string;
  applicableTimeStart: string;
  applicableTimeEnd: string;
  applicableOnDays: string[];
  applyToSpecificItems: boolean;
  selectedItemIds: string[];
  imagePreview: string | null;
  /** Boost = item-facing %; Precision = sheet-facing rules. */
  conditionsMode: "boost" | "precision";
  /** First-screen path: Precision | Percentage(Boost) | BOGO */
  createPath: OfferCreatePath;
};

export function todayYmd(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function plusDaysYmd(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function emptyOfferFormValues(presetType?: OfferType): OfferFormValues {
  const isBogo =
    presetType === "BUY_X_GET_Y" || presetType === "BUY_N_GET_M" || presetType === "BOGO";
  const createPath: OfferCreatePath = isBogo ? "bogo" : "boost";
  return {
    title: "",
    description: "",
    offerType: presetType ?? "PERCENTAGE",
    discountValue: "",
    minOrder: "",
    maxOrder: "",
    couponCode: "",
    buyQty: isBogo ? "1" : "",
    getQty: isBogo ? "1" : "",
    validFrom: todayYmd(),
    validTill: plusDaysYmd(1),
    autoApply: true,
    maxDiscountAmount: "",
    maxUsesTotal: "",
    maxUsesPerUser: "",
    firstOrderOnly: false,
    newUserOnly: false,
    isActive: true,
    isStackable: false,
    priority: "0",
    applicableTimeStart: "",
    applicableTimeEnd: "",
    applicableOnDays: [],
    applyToSpecificItems: false,
    selectedItemIds: [],
    imagePreview: null,
    conditionsMode: "boost",
    createPath,
  };
}

function discountFromOffer(o: Offer): string {
  const isPct = ["PERCENTAGE", "CART_PERCENTAGE"].includes(o.offer_type);
  if (isPct && o.discount_percentage != null && o.discount_percentage !== "") {
    return String(Number(o.discount_percentage));
  }
  if (o.discount_value != null && o.discount_value !== "") {
    return String(Number(o.discount_value));
  }
  if (o.discount_percentage != null && o.discount_percentage !== "") {
    return String(Number(o.discount_percentage));
  }
  return "";
}

export function populateOfferFormFromOffer(o: Offer): OfferFormValues {
  const meta = (o.offer_metadata as Record<string, unknown> | null) ?? {};
  const hasItems =
    o.offer_sub_type === "SPECIFIC_ITEM" ||
    (Array.isArray(o.menu_item_ids) && o.menu_item_ids.length > 0);

  const timeStart =
    normalizeTimeColumnForInput(o.applicable_time_start) ||
    normalizeTimeColumnForInput(meta.applicable_time_start as string | undefined) ||
    "";
  const timeEnd =
    normalizeTimeColumnForInput(o.applicable_time_end) ||
    normalizeTimeColumnForInput(meta.applicable_time_end as string | undefined) ||
    "";

  const conditionsMode: "boost" | "precision" =
    meta.create_path === "precision" || meta.conditions_mode === "precision"
      ? "precision"
      : meta.create_path === "boost" || meta.conditions_mode === "boost"
        ? "boost"
        : hasItems
          ? "boost"
          : "precision";

  const isBogoType =
    o.offer_type === "BUY_X_GET_Y" ||
    o.offer_type === "BUY_N_GET_M" ||
    o.offer_type === "BOGO" ||
    meta.create_path === "bogo";
  const createPath: OfferCreatePath = isBogoType
    ? "bogo"
    : conditionsMode === "precision"
      ? "precision"
      : "boost";

  const selectedIds = conditionsMode === "precision" ? [] : hasItems ? [...(o.menu_item_ids ?? [])] : [];

  return {
    title: o.offer_title ?? "",
    description: o.offer_description ?? "",
    offerType: o.offer_type,
    discountValue: discountFromOffer(o),
    minOrder: o.min_order_amount != null ? String(o.min_order_amount) : "",
    maxOrder: o.max_order_amount != null ? String(o.max_order_amount) : "",
    couponCode: o.coupon_code ?? "",
    buyQty: o.buy_quantity != null ? String(o.buy_quantity) : "",
    getQty: o.get_quantity != null ? String(o.get_quantity) : "",
    validFrom: toLocalDateInputValue(o.valid_from),
    validTill: toLocalDateInputValue(o.valid_till),
    autoApply: o.auto_apply ?? true,
    maxDiscountAmount: o.max_discount_amount != null ? String(o.max_discount_amount) : "",
    maxUsesTotal: o.max_uses_total != null ? String(o.max_uses_total) : "",
    maxUsesPerUser: o.max_uses_per_user != null ? String(o.max_uses_per_user) : "",
    firstOrderOnly: o.first_order_only ?? false,
    newUserOnly: o.new_user_only ?? false,
    isActive: o.is_active !== false,
    isStackable: o.is_stackable ?? false,
    priority: o.priority != null ? String(o.priority) : "0",
    applicableTimeStart: timeStart,
    applicableTimeEnd: timeEnd,
    applicableOnDays: Array.isArray(o.applicable_on_days) ? [...o.applicable_on_days] : [],
    applyToSpecificItems: conditionsMode === "precision" ? false : selectedIds.length > 0,
    selectedItemIds: selectedIds,
    imagePreview: o.offer_image_url ?? null,
    conditionsMode,
    createPath,
  };
}

/** Auto priority — same rules as partnersite (higher discount → higher priority). */
export function computeAutoPriority(v: OfferFormValues): number {
  if (["BUY_X_GET_Y", "BUY_N_GET_M", "BOGO"].includes(v.offerType)) {
    const buy = Math.max(1, parseInt(v.buyQty || "1", 10) || 1);
    const get = Math.max(1, parseInt(v.getQty || "1", 10) || 1);
    return Math.round((get / (buy + get)) * 100);
  }
  if (["PERCENTAGE", "CART_PERCENTAGE", "COUPON"].includes(v.offerType)) {
    const pct = parseFloat(v.discountValue || "0");
    return Number.isFinite(pct) ? Math.round(Math.min(100, Math.max(0, pct))) : 0;
  }
  if (["FLAT", "CART_FLAT"].includes(v.offerType)) {
    const amt = parseFloat(v.discountValue || "0");
    return Number.isFinite(amt) ? Math.min(100, Math.round(amt / 5)) : 0;
  }
  return 0;
}

export function canProceedFromStep(step: OfferWizardStep, v: OfferFormValues): boolean {
  switch (step) {
    case "choose":
      return v.offerType === "PERCENTAGE" || ["BUY_X_GET_Y", "BUY_N_GET_M", "BOGO"].includes(v.offerType);
    case "applicability":
      // Precision is whole-menu only - no item selection required.
      if (v.createPath === "precision" || v.conditionsMode === "precision") return true;
      if (v.applyToSpecificItems) return v.selectedItemIds.length > 0;
      return true;
    case "conditions": {
      if (["BUY_X_GET_Y", "BUY_N_GET_M", "BOGO"].includes(v.offerType)) {
        const buy = parseInt(v.buyQty || "", 10);
        const get = parseInt(v.getQty || "", 10);
        return Number.isFinite(buy) && buy >= 1 && Number.isFinite(get) && get >= 1;
      }
      if (["PERCENTAGE", "CART_PERCENTAGE"].includes(v.offerType)) {
        const n = parseFloat(v.discountValue || "");
        return Number.isFinite(n) && n >= DISCOUNT_SLIDER_MIN && n <= 100;
      }
      if (["FLAT", "CART_FLAT", "COUPON"].includes(v.offerType)) {
        const n = parseFloat(v.discountValue || "");
        return Number.isFinite(n) && n > 0;
      }
      return true;
    }
    case "schedule":
      return Boolean(v.validFrom.trim() && v.validTill.trim() && v.validFrom <= v.validTill);
    case "review":
      return Boolean(v.title.trim() && v.validFrom.trim() && v.validTill.trim() && v.validFrom <= v.validTill);
    default:
      return true;
  }
}

export function nextStepBlockedReason(step: OfferWizardStep, v: OfferFormValues): string | null {
  if (canProceedFromStep(step, v)) return null;
  switch (step) {
    case "choose":
      return "Choose Precision, Buy one get one, or Percentage discount";
    case "applicability":
      return "Select at least one menu item";
    case "conditions":
      if (["BUY_X_GET_Y", "BUY_N_GET_M", "BOGO"].includes(v.offerType)) {
        return "Set buy and get quantities";
      }
      return `Set a discount of at least ${DISCOUNT_SLIDER_MIN}%`;
    case "schedule":
      return "Set a valid start and end date";
    case "review":
      return "Offer title and validity dates are required";
    default:
      return "Fill required fields to continue";
  }
}

export function validateWizardStep(step: OfferWizardStep, v: OfferFormValues): string | null {
  return nextStepBlockedReason(step, v);
}

export function buildMerchantReviewSummary(
  v: OfferFormValues,
  opts?: { selectedCount?: number; menuItemCount?: number }
): {
  headline: string;
  customerSees: string;
  equivalent: string;
  appliesLabel: string;
} {
  const buy = Math.max(1, parseInt(v.buyQty || "1", 10) || 1);
  const get = Math.max(1, parseInt(v.getQty || "1", 10) || 1);
  const pct = parseFloat(v.discountValue || "0");
  const isBogo = ["BUY_X_GET_Y", "BUY_N_GET_M", "BOGO"].includes(v.offerType);
  const selectedCount = opts?.selectedCount ?? v.selectedItemIds.length;
  const menuCount = opts?.menuItemCount;
  const appliesLabel =
    v.createPath === "precision" || v.conditionsMode === "precision"
      ? "All menu items (Precision)"
      : v.applyToSpecificItems
        ? `${selectedCount} selected item${selectedCount === 1 ? "" : "s"}`
        : menuCount != null
          ? `All menu items (${menuCount})`
          : "All menu items";

  if (isBogo) {
    const equivPct = Math.round((get / (buy + get)) * 100);
    return {
      headline: `Buy ${buy} Get ${get} Free`,
      customerSees:
        get === 1 && buy === 1
          ? "Customers will get one item free when they buy one."
          : `Customers will get ${get} item${get > 1 ? "s" : ""} free when they buy ${buy}.`,
      equivalent: `This is equivalent to a ${equivPct}% discount.`,
      appliesLabel,
    };
  }

  if (["PERCENTAGE", "CART_PERCENTAGE"].includes(v.offerType) && pct > 0) {
    const cap = v.maxDiscountAmount;
    return {
      headline: cap ? `${pct}% Off up to ₹${cap}` : `Flat ${pct}% Off`,
      customerSees: cap
        ? `Customers save ${pct}% on eligible items, up to ₹${cap}.`
        : `Customers get a flat ${pct}% discount on eligible items.`,
      equivalent: v.minOrder
        ? `Applies when order value is at least ₹${v.minOrder}.`
        : "No minimum order value required.",
      appliesLabel,
    };
  }

  return {
    headline: v.title.trim() || "Your offer",
    customerSees: "Complete the previous steps to see how this offer looks to customers.",
    equivalent: "",
    appliesLabel,
  };
}

export function buildReviewRows(
  v: OfferFormValues,
  opts?: {
    conditionsMode?: "boost" | "precision";
    selectedCount?: number;
    menuItemCount?: number;
  }
): { label: string; value: string }[] {
  const summary = buildMerchantReviewSummary(v, {
    selectedCount: opts?.selectedCount,
    menuItemCount: opts?.menuItemCount,
  });
  const isPct = ["PERCENTAGE", "CART_PERCENTAGE"].includes(v.offerType);
  const isBogo = ["BUY_X_GET_Y", "BUY_N_GET_M", "BOGO"].includes(v.offerType);
  const typeValue = isBogo
    ? formatOfferTypeLabel(v.offerType)
    : v.createPath === "precision" || opts?.conditionsMode === "precision"
      ? "Precision"
      : "Boost";
  const rows: { label: string; value: string }[] = [
    { label: "Offer name", value: v.title.trim() || "—" },
    { label: "Offer type", value: typeValue },
    { label: "Customer sees", value: summary.headline },
    {
      label: "Discount",
      value: v.discountValue
        ? isPct
          ? `${v.discountValue}%`
          : formatOfferInr(Number(v.discountValue))
        : summary.equivalent || "—",
    },
    {
      label: "Applies to",
      value:
        v.createPath === "precision" || opts?.conditionsMode === "precision"
          ? "All menu items (Precision)"
          : summary.appliesLabel,
    },
    { label: "Valid", value: `${v.validFrom} → ${v.validTill}` },
    { label: "Priority", value: `Auto · ${computeAutoPriority(v)}` },
  ];
  if (v.minOrder) rows.push({ label: "Min order", value: formatOfferInr(Number(v.minOrder)) });
  if (v.maxDiscountAmount) {
    rows.push({ label: "Max discount cap", value: formatOfferInr(Number(v.maxDiscountAmount)) });
  }
  if (v.applicableTimeStart || v.applicableTimeEnd) {
    rows.push({
      label: "Daily slot",
      value: `${v.applicableTimeStart || "—"} – ${v.applicableTimeEnd || "—"}`,
    });
  }
  return rows;
}
