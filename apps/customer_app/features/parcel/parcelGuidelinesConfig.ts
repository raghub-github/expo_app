/**
 * Parcel booking guidelines — one slideshow page per vehicle category
 * that can carry parcels (from dispatch vehicle-category assignments).
 *
 * Parcel does not use 4 Wheeler AC. Weight slabs:
 *   2W 0–20 kg · 3W 20–100 kg · 4W 100–200 kg
 */

export type ParcelVehicleCategoryCode =
  | "2_wheeler"
  | "3_wheeler"
  | "4_wheeler_non_ac";

export type ParcelGuidelineItem = {
  id: string;
  /** Ionicons glyph name */
  icon: string;
  iconColor: string;
  iconBg: string;
  title: string;
};

export type ParcelVehicleSlide = {
  categoryCode: ParcelVehicleCategoryCode;
  title: string;
  subtitle: string;
  vehicleLabels: string[];
  guidelines: ParcelGuidelineItem[];
};

const CATEGORY_META: Record<
  ParcelVehicleCategoryCode,
  {
    title: string;
    subtitle: string;
    fallbackVehicles: string[];
    weightLabel: string;
    fitLabel: string;
    bookWeightLabel: string;
  }
> = {
  "2_wheeler": {
    title: "2 Wheeler",
    subtitle: "Bike · Scooter · EV Bike",
    fallbackVehicles: ["Bike", "Scooter", "EV Bike"],
    weightLabel: "Parcel weight is 0–20 kg",
    fitLabel: "Parcel is portable on a bike",
    bookWeightLabel: "0–20 kg",
  },
  "3_wheeler": {
    title: "3 Wheeler",
    subtitle: "Auto · EV Auto · Cargo Auto",
    fallbackVehicles: ["Auto Rickshaw", "EV Auto", "Cargo Auto"],
    weightLabel: "Parcel weight is 20–100 kg",
    fitLabel: "Parcel fits in an auto / cargo auto",
    bookWeightLabel: "20–100 kg",
  },
  "4_wheeler_non_ac": {
    title: "4 Wheeler",
    subtitle: "Ace · Pickup · Van · Mini truck",
    fallbackVehicles: ["Tata Ace", "Pickup", "Cargo Van", "Mini Truck"],
    weightLabel: "Parcel weight is 100–200 kg",
    fitLabel: "Parcel fits in a utility / cargo vehicle",
    bookWeightLabel: "100–200 kg",
  },
};

const SHARED_RESTRICTED: ParcelGuidelineItem[] = [
  {
    id: "fragile",
    icon: "diamond-outline",
    iconColor: "#7C3AED",
    iconBg: "#EDE9FE",
    title: "Items are not expensive/fragile",
  },
  {
    id: "alcohol",
    icon: "ban-outline",
    iconColor: "#DC2626",
    iconBg: "#FEE2E2",
    title: "Items are not Alcohol / restricted items",
  },
];

export const PARCEL_CATEGORY_ORDER: ParcelVehicleCategoryCode[] = [
  "2_wheeler",
  "3_wheeler",
  "4_wheeler_non_ac",
];

/** Defaults when API is unavailable — mirrors typical Super Admin parcel matrix. */
export const FALLBACK_PARCEL_CATEGORY_CODES: ParcelVehicleCategoryCode[] = [
  "2_wheeler",
  "3_wheeler",
  "4_wheeler_non_ac",
];

export function buildParcelSlide(
  categoryCode: ParcelVehicleCategoryCode,
  vehicleLabels?: string[]
): ParcelVehicleSlide {
  const meta = CATEGORY_META[categoryCode];
  const labels =
    vehicleLabels && vehicleLabels.length > 0 ? vehicleLabels : meta.fallbackVehicles;

  const fitIcon =
    categoryCode === "2_wheeler"
      ? "bicycle-outline"
      : categoryCode === "3_wheeler"
        ? "car-outline"
        : "bus-outline";

  return {
    categoryCode,
    title: meta.title,
    subtitle: labels.join(" · "),
    vehicleLabels: labels,
    guidelines: [
      {
        id: "weight",
        icon: "cube-outline",
        iconColor: "#D97706",
        iconBg: "#FEF3C7",
        title: meta.weightLabel,
      },
      {
        id: "fit",
        icon: fitIcon,
        iconColor: "#059669",
        iconBg: "#D1FAE5",
        title: meta.fitLabel,
      },
      ...SHARED_RESTRICTED,
    ],
  };
}

export function isParcelCategoryCode(code: string): code is ParcelVehicleCategoryCode {
  return (PARCEL_CATEGORY_ORDER as string[]).includes(code);
}

/** Book-screen display meta for a parcel vehicle category. */
export function parcelCategoryBookMeta(code: ParcelVehicleCategoryCode): {
  name: string;
  imageKey: "bike" | "auto" | "van";
  weightLabel: string;
  blurb: string;
  /** Bottom capacity line — dimensions + weight (reference courier UI). */
  capacityRow: string;
} {
  const meta = CATEGORY_META[code];
  const imageKey: "bike" | "auto" | "van" =
    code === "2_wheeler" ? "bike" : code === "3_wheeler" ? "auto" : "van";

  if (code === "2_wheeler") {
    return {
      name: meta.title,
      imageKey,
      weightLabel: meta.bookWeightLabel,
      blurb: "Best for delivering documents & daily essentials",
      capacityRow: "0.4 x 0.4 x 0.4 Meter · Up to 20 kg",
    };
  }
  if (code === "3_wheeler") {
    return {
      name: meta.title,
      imageKey,
      weightLabel: meta.bookWeightLabel,
      blurb: "Best for carrying bulk fruit & vegetable supplies",
      capacityRow: "1.5 x 1.3 x 1.3 Meter · Up to 100 kg",
    };
  }
  return {
    name: meta.title,
    imageKey,
    weightLabel: meta.bookWeightLabel,
    blurb: "Best for delivering furniture & commercial goods",
    capacityRow: "2.2 x 1.4 x 1.8 Meter · Up to 200 kg",
  };
}
