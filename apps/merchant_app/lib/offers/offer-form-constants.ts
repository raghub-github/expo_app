/** Offer Engine V3 — wizard constants (aligned with partnersite Create Offer) */

export type OfferWizardStep =
  | "choose"
  | "applicability"
  | "conditions"
  | "schedule"
  | "review";

/** Steps shown in the progress bar (after promo type is chosen). */
export const OFFER_WIZARD_STEPS: OfferWizardStep[] = [
  "applicability",
  "conditions",
  "schedule",
  "review",
];

/** Full navigation order including the initial choose screen. */
export const OFFER_NAV_STEPS: OfferWizardStep[] = ["choose", ...OFFER_WIZARD_STEPS];

export const OFFER_STEP_LABELS: Record<OfferWizardStep, string> = {
  choose: "Choose type",
  applicability: "Applies to",
  conditions: "Conditions",
  schedule: "Schedule",
  review: "Review",
};

export const OFFER_PROMO_CHOICES = [
  {
    id: "precision" as const,
    offerType: "PERCENTAGE" as const,
    title: "Precision",
    description:
      "Checkout / offer-sheet discount with min order or max cap. Applies to the whole menu - no item picking.",
    buyQuantity: "",
    getQuantity: "",
  },
  {
    id: "bogo" as const,
    offerType: "BUY_X_GET_Y" as const,
    title: "Buy one get one",
    description: "Delight your customers by providing buy one get one free on selected items.",
    buyQuantity: "1",
    getQuantity: "1",
  },
  {
    id: "percentage" as const,
    offerType: "PERCENTAGE" as const,
    title: "Percentage discount",
    description: "Create Boost promo discounts like 'Flat 30% off on select items'.",
    buyQuantity: "",
    getQuantity: "",
  },
] as const;

/** Which create path the merchant started from (drives wizard UI). */
export type OfferCreatePath = "precision" | "boost" | "bogo";

export const RECOMMENDED_PERCENTAGE_OFFERS = [
  { id: "flat-30-149", discount: 30, maxDiscount: null as number | null, mov: 149, label: "Flat 30% OFF" },
  { id: "flat-40-149", discount: 40, maxDiscount: null, mov: 149, label: "Flat 40% OFF" },
  { id: "flat-50-149", discount: 50, maxDiscount: null, mov: 149, label: "Flat 50% OFF" },
  { id: "cap-50-120-199", discount: 50, maxDiscount: 120, mov: 199, label: "50% OFF up to ₹120" },
  { id: "cap-60-120-199", discount: 60, maxDiscount: 120, mov: 199, label: "60% OFF up to ₹120" },
  { id: "cap-70-150-249", discount: 70, maxDiscount: 150, mov: 249, label: "70% OFF up to ₹150" },
] as const;

export const DISCOUNT_SLIDER_MIN = 10;
export const DISCOUNT_SLIDER_MAX = 80;
export const DISCOUNT_SLIDER_STEP = 5;

/** Boost mode: simpler discount slider (0–70%, popular at 30%). */
export const BOOST_SLIDER_MAX = 70;
export const BOOST_SLIDER_STEP = 5;
export const BOOST_POPULAR_PERCENT = 30;

export const RECOMMENDED_BOGO_OFFERS = [
  { id: "bogo-1-1", buy: 1, get: 1, label: "Buy 1 Get 1", hint: "≈ 50% off" },
  { id: "bogo-2-1", buy: 2, get: 1, label: "Buy 2 Get 1", hint: "≈ 33% off" },
  { id: "bogo-3-1", buy: 3, get: 1, label: "Buy 3 Get 1", hint: "≈ 25% off" },
  { id: "bogo-1-2", buy: 1, get: 2, label: "Buy 1 Get 2", hint: "≈ 67% off" },
] as const;
