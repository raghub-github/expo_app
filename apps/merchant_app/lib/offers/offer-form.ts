import type { Offer, OfferType } from "@/services/offersApi";
import { toLocalDateInputValue, normalizeTimeColumnForInput } from "@/lib/offers/offer-utils";
import { formatOfferTypeLabel } from "@/lib/offers/offer-lifecycle";
import { formatOfferInr } from "@/lib/offers/offer-analytics";

export type OfferWizardStep = "basic" | "type" | "applicability" | "conditions" | "review";

export const WIZARD_STEPS: { id: OfferWizardStep; label: string }[] = [
  { id: "basic", label: "Basic info" },
  { id: "type", label: "Offer type" },
  { id: "applicability", label: "Applies to" },
  { id: "conditions", label: "Conditions" },
  { id: "review", label: "Review" },
];

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
  applyToSpecificItems: boolean;
  selectedItemIds: string[];
  imagePreview: string | null;
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
  return {
    title: "",
    description: "",
    offerType: presetType ?? "PERCENTAGE",
    discountValue: "",
    minOrder: "",
    maxOrder: "",
    couponCode: "",
    buyQty: "",
    getQty: "",
    validFrom: todayYmd(),
    validTill: plusDaysYmd(30),
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
    applyToSpecificItems: false,
    selectedItemIds: [],
    imagePreview: null,
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
    applyToSpecificItems: hasItems,
    selectedItemIds: hasItems ? [...(o.menu_item_ids ?? [])] : [],
    imagePreview: o.offer_image_url ?? null,
  };
}

export function validateWizardStep(
  step: OfferWizardStep,
  v: OfferFormValues
): string | null {
  switch (step) {
    case "basic":
      if (!v.title.trim()) return "Offer title is required.";
      return null;
    case "type": {
      const isPct = ["PERCENTAGE", "CART_PERCENTAGE"].includes(v.offerType);
      const needsBuyGet = ["BUY_X_GET_Y", "BUY_N_GET_M", "BOGO"].includes(v.offerType);
      if (isPct && !v.discountValue.trim()) return "Enter discount percentage.";
      if (["FLAT", "CART_FLAT"].includes(v.offerType) && !v.discountValue.trim()) {
        return "Enter flat discount amount.";
      }
      if (v.offerType === "COUPON" && !v.couponCode.trim()) return "Coupon code is required.";
      if (needsBuyGet && !v.buyQty.trim()) return "Enter buy quantity.";
      return null;
    }
    case "applicability":
      if (v.applyToSpecificItems && v.selectedItemIds.length === 0) {
        return "Select at least one menu item.";
      }
      return null;
    case "conditions":
      if (!v.validFrom.trim() || !v.validTill.trim()) return "Valid from and till dates are required.";
      if (v.validFrom > v.validTill) return "Valid till must be on or after valid from.";
      return null;
    case "review":
      return null;
    default:
      return null;
  }
}

export function buildReviewRows(v: OfferFormValues): { label: string; value: string }[] {
  const isPct = ["PERCENTAGE", "CART_PERCENTAGE"].includes(v.offerType);
  const rows: { label: string; value: string }[] = [
    { label: "Title", value: v.title.trim() || "—" },
    { label: "Type", value: formatOfferTypeLabel(v.offerType) },
    {
      label: "Discount",
      value: v.discountValue
        ? isPct
          ? `${v.discountValue}%`
          : formatOfferInr(Number(v.discountValue))
        : "—",
    },
    {
      label: "Applies to",
      value: v.applyToSpecificItems
        ? `${v.selectedItemIds.length} menu item(s)`
        : "All orders",
    },
    { label: "Valid", value: `${v.validFrom} → ${v.validTill}` },
    { label: "Auto-apply", value: v.autoApply ? "Yes" : "No" },
    { label: "Status", value: v.isActive ? "Active" : "Inactive" },
  ];
  if (v.minOrder) rows.push({ label: "Min order", value: formatOfferInr(Number(v.minOrder)) });
  if (v.maxOrder) rows.push({ label: "Max order", value: formatOfferInr(Number(v.maxOrder)) });
  if (v.maxDiscountAmount) {
    rows.push({ label: "Max discount cap", value: formatOfferInr(Number(v.maxDiscountAmount)) });
  }
  if (v.couponCode) rows.push({ label: "Coupon", value: v.couponCode });
  if (v.maxUsesTotal) rows.push({ label: "Total uses", value: v.maxUsesTotal });
  if (v.maxUsesPerUser) rows.push({ label: "Per user", value: v.maxUsesPerUser });
  if (v.firstOrderOnly) rows.push({ label: "Audience", value: "First order only" });
  else if (v.newUserOnly) rows.push({ label: "Audience", value: "New users only" });
  if (v.applicableTimeStart || v.applicableTimeEnd) {
    rows.push({
      label: "Daily slot",
      value: `${v.applicableTimeStart || "—"} – ${v.applicableTimeEnd || "—"}`,
    });
  }
  return rows;
}
