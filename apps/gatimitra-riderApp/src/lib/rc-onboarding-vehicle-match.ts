/**
 * Client mirror of backend `rider-rc-onboarding-vehicle-check` — used to show the
 * RC vehicle-type mismatch sheet when the rider changes Category/Type and returns
 * to the RC step with a previously verified RC (without another Cashfree call).
 */
import type { OnboardingVehicleType } from "./onboarding-vehicle-types";
import { isElectricOnboardingVehicle } from "./onboarding-vehicle-types";

export type RiderVehicleClass = "2_wheeler" | "3_wheeler" | "4_wheeler";

export function vehicleClassFromOnboardingSelection(
  vehicleCategoryCode?: string | null,
  vehicleChoice?: string | null,
): RiderVehicleClass | null {
  const c = String(vehicleCategoryCode ?? "").trim().toLowerCase();
  if (c === "2_wheeler" || c === "two_wheeler" || c === "bike" || c === "scooter") {
    return "2_wheeler";
  }
  if (c === "3_wheeler" || c === "three_wheeler" || c === "auto") return "3_wheeler";
  if (
    c === "4_wheeler" ||
    c === "four_wheeler" ||
    c.startsWith("4_wheeler") ||
    c === "cab" ||
    c === "car" ||
    c === "taxi"
  ) {
    return "4_wheeler";
  }
  const code = String(vehicleChoice ?? "").trim().toLowerCase();
  if (!code) return null;
  if (/\bev|bike|scooter|cycle|2[_-]?w/.test(code)) return "2_wheeler";
  if (/auto|3[_-]?w|rickshaw/.test(code)) return "3_wheeler";
  if (/car|cab|taxi|ace|4[_-]?w|lmv/.test(code)) return "4_wheeler";
  return null;
}

export function canonicalClassFromCashfreeRc(data: Record<string, unknown> | null | undefined): RiderVehicleClass | null {
  if (!data) return null;
  const raw = [data.vehicle_class, data.class, data.vehicle_category, data.body_type]
    .map((v) => String(v ?? "").trim().toUpperCase())
    .filter(Boolean)
    .join(" | ");
  if (!raw) return null;
  if (/\b(3WN|3WT|3W\b|THREE[\s-]*WHEEL|AUTO\s*RICK|E-?RICK|LMV[\s-]*3|3[\s-]*WHEELER)/.test(raw)) {
    return "3_wheeler";
  }
  if (
    /\b(M-?CYCLE|MCWG|MCWOG|SCOOTER|MOPED|TWO[\s-]*WHEEL|2W\b|LMV[\s-]*TW|MOTOR\s*CYCLE|2[\s-]*WHEELER)/.test(
      raw,
    )
  ) {
    return "2_wheeler";
  }
  if (
    /\b(LMV|MOTOR\s*CAR|MOTOR\s*CAB|MGV|HGV|LPV|LCV|FOUR[\s-]*WHEEL|4W\b|CAR\b|CAB\b|TAXI|JEEP|4[\s-]*WHEELER)/.test(
      raw,
    )
  ) {
    return "4_wheeler";
  }
  return null;
}

export type RcFuelKind = "electric" | "petrol" | "diesel" | "cng" | "hybrid" | "unknown";

export function inferRcFuelKind(verifiedData: Record<string, unknown>): RcFuelKind {
  const raw = [verifiedData.fuel_type, verifiedData.type, verifiedData.fuel]
    .map((v) => String(v ?? "").trim())
    .filter(Boolean)
    .join(" ")
    .toUpperCase();
  if (!raw) return "unknown";
  if (/ELECTRIC|EV\b|BATTERY/.test(raw)) return "electric";
  if (/DIESEL|HSD/.test(raw)) return "diesel";
  if (/\bCNG\b|LPG|COMPRESSED\s*NATURAL/.test(raw)) return "cng";
  if (/PETROL|MOTOR\s*SPIRIT|\bMS\b/.test(raw)) return "petrol";
  if (/HYBRID/.test(raw)) return "hybrid";
  return "unknown";
}

const CLASS_LABEL: Record<RiderVehicleClass, string> = {
  "2_wheeler": "2 Wheeler",
  "3_wheeler": "3 Wheeler",
  "4_wheeler": "4 Wheeler",
};

export function rcVehicleDisplayLabel(verifiedData: Record<string, unknown>): string {
  const cls =
    String(verifiedData.vehicle_class || verifiedData.class || verifiedData.body_type || "").trim();
  const fuel = inferRcFuelKind(verifiedData);
  const fuelLabel =
    fuel === "electric"
      ? "Electric"
      : fuel === "petrol"
        ? "Petrol"
        : fuel === "diesel"
          ? "Diesel"
          : fuel === "cng"
            ? "CNG"
            : "";
  const canon = canonicalClassFromCashfreeRc(verifiedData);
  const wheel = canon ? CLASS_LABEL[canon] : "";
  const parts = [wheel, cls, fuelLabel].filter(Boolean);
  return parts.length ? parts.join(" · ") : "Vehicle on RC";
}

export type RcOnboardingVehicleMatchClient = {
  match: boolean;
  rcSignalKnown: boolean;
  rcLabel: string;
  selectedLabel: string;
  rcClass: RiderVehicleClass | null;
  selectedClass: RiderVehicleClass | null;
};

export function evaluateRcOnboardingVehicleMatchClient(args: {
  vehicleChoice?: string | null;
  vehicleCategoryCode?: string | null;
  onboardingFlow?: string | null;
  vehicleTypeLabel?: string | null;
  verifiedData: Record<string, unknown>;
}): RcOnboardingVehicleMatchClient {
  const selectedClass = vehicleClassFromOnboardingSelection(
    args.vehicleCategoryCode,
    args.vehicleChoice,
  );
  const rcClass = canonicalClassFromCashfreeRc(args.verifiedData);
  const rcFuel = inferRcFuelKind(args.verifiedData);
  const selectedElectric = isElectricOnboardingVehicle({
    code: String(args.vehicleChoice || ""),
    categoryCode: args.vehicleCategoryCode ?? null,
    label: args.vehicleTypeLabel ?? args.vehicleChoice ?? "",
    onboardingFlow:
      args.onboardingFlow === "rental_ev" ||
      args.onboardingFlow === "payment" ||
      args.onboardingFlow === "dl_rc"
        ? args.onboardingFlow
        : "dl_rc",
    mapsToVehicleType: args.vehicleChoice ?? null,
  });
  const rcLabel = rcVehicleDisplayLabel(args.verifiedData);
  const selectedLabel =
    String(args.vehicleTypeLabel || "").trim() ||
    String(args.vehicleChoice || "").trim() ||
    String(args.vehicleCategoryCode || "").trim() ||
    "Selected vehicle";

  const rcSignalKnown = rcClass != null || rcFuel !== "unknown";
  if (!rcSignalKnown) {
    return {
      match: true,
      rcSignalKnown: false,
      rcLabel,
      selectedLabel,
      rcClass,
      selectedClass,
    };
  }

  let match = true;
  if (selectedClass && rcClass && selectedClass !== rcClass) match = false;
  if (selectedElectric && (rcFuel === "petrol" || rcFuel === "diesel" || rcFuel === "cng")) {
    match = false;
  }
  if (!selectedElectric && rcFuel === "electric") match = false;

  return {
    match,
    rcSignalKnown: true,
    rcLabel,
    selectedLabel,
    rcClass,
    selectedClass,
  };
}

export type SuggestedOnboardingVehicleClient = {
  vehicleChoice: string;
  vehicleCategoryCode: string;
  label: string;
  onboardingFlow: "dl_rc" | "rental_ev" | "payment";
};

/** Best catalog row for a verified RC (Continue with last submitted RC & vehicle type). */
export function suggestOnboardingVehicleFromRcClient(
  verifiedData: Record<string, unknown>,
  catalog: OnboardingVehicleType[],
): SuggestedOnboardingVehicleClient | null {
  const rcClass = canonicalClassFromCashfreeRc(verifiedData);
  const rcFuel = inferRcFuelKind(verifiedData);
  if (!rcClass) return null;
  const wantElectric = rcFuel === "electric";
  const active = catalog.filter((r) => r.isActive !== false);
  const candidates = active.filter((row) => {
    const rowClass = vehicleClassFromOnboardingSelection(row.categoryCode, row.code);
    if (rowClass !== rcClass) return false;
    const electric = isElectricOnboardingVehicle(row);
    if (wantElectric && !electric) return false;
    if (!wantElectric && electric && rcFuel !== "unknown") return false;
    return true;
  });
  const pool =
    candidates.length > 0
      ? candidates
      : active.filter(
          (row) => vehicleClassFromOnboardingSelection(row.categoryCode, row.code) === rcClass,
        );
  if (!pool.length) return null;

  const score = (row: OnboardingVehicleType): number => {
    let s = 0;
    const code = row.code.toLowerCase();
    const label = String(row.label || "").toLowerCase();
    const rawClass = String(verifiedData.vehicle_class || "").toLowerCase();
    if (wantElectric && (code.includes("ev") || label.includes("ev"))) s += 10;
    if (!wantElectric && !code.includes("ev") && row.onboardingFlow !== "rental_ev") s += 5;
    if (rawClass.includes("scooter") && (code.includes("scooter") || label.includes("scooter"))) {
      s += 8;
    }
    if (rawClass.includes("cycle") && code.includes("bike")) s += 4;
    if (row.onboardingFlow === "rental_ev" && wantElectric) s += 6;
    return s;
  };
  pool.sort((a, b) => score(b) - score(a));
  const best = pool[0]!;
  const categoryCode = String(best.categoryCode || "").trim();
  if (!categoryCode) return null;
  const flow =
    best.onboardingFlow === "rental_ev" ||
    best.onboardingFlow === "payment" ||
    best.onboardingFlow === "dl_rc"
      ? best.onboardingFlow
      : "dl_rc";
  return {
    vehicleChoice: best.code,
    vehicleCategoryCode: categoryCode,
    label: String(best.label || best.code).trim(),
    onboardingFlow: flow,
  };
}
