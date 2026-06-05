/** Service types stored in rider_vehicles.service_types jsonb */
export const RIDER_SERVICE_TYPE_OPTIONS = [
  { value: "all", label: "All services" },
  { value: "food", label: "Food delivery" },
  { value: "parcel", label: "Parcel delivery" },
  { value: "person_ride", label: "Person ride (cab)" },
] as const;

export const RIDER_SERVICE_TYPE_VALUES = ["food", "parcel", "person_ride"] as const;
export type RiderServiceTypeValue = (typeof RIDER_SERVICE_TYPE_VALUES)[number];

export const OWNERSHIP_TYPE_OPTIONS = [
  { value: "ownership", label: "Own vehicle" },
  { value: "rental", label: "Rental vehicle" },
  { value: "authorization_letter", label: "Authorization letter" },
] as const;

export const AC_TYPE_OPTIONS = [
  { value: "AC", label: "AC" },
  { value: "Non-AC", label: "Non-AC" },
] as const;

/** Common Indian RTO state codes from registration plate prefix (e.g. DL01AB1234 → DL). */
const INDIAN_RTO_STATE_CODES: Record<string, string> = {
  AN: "Andaman and Nicobar",
  AP: "Andhra Pradesh",
  AR: "Arunachal Pradesh",
  AS: "Assam",
  BR: "Bihar",
  CG: "Chhattisgarh",
  CH: "Chandigarh",
  DD: "Daman and Diu",
  DL: "Delhi",
  GA: "Goa",
  GJ: "Gujarat",
  HP: "Himachal Pradesh",
  HR: "Haryana",
  JH: "Jharkhand",
  JK: "Jammu and Kashmir",
  KA: "Karnataka",
  KL: "Kerala",
  LA: "Ladakh",
  LD: "Lakshadweep",
  MH: "Maharashtra",
  ML: "Meghalaya",
  MN: "Manipur",
  MP: "Madhya Pradesh",
  MZ: "Mizoram",
  NL: "Nagaland",
  OD: "Odisha",
  PB: "Punjab",
  PY: "Puducherry",
  RJ: "Rajasthan",
  SK: "Sikkim",
  TN: "Tamil Nadu",
  TR: "Tripura",
  TS: "Telangana",
  UK: "Uttarakhand",
  UP: "Uttar Pradesh",
  WB: "West Bengal",
};

export function normalizeRegistrationNumber(value: string): string {
  return value.trim().toUpperCase().replace(/\s+/g, "");
}

/** First two letters of plate → state code saved in registration_state. */
export function deriveRegistrationStateFromPlate(registrationNumber: string): string | null {
  const reg = normalizeRegistrationNumber(registrationNumber);
  const match = reg.match(/^([A-Z]{2})/);
  if (!match) return null;
  return match[1];
}

export function registrationStateLabel(code: string | null | undefined): string | null {
  if (!code?.trim()) return null;
  const upper = code.trim().toUpperCase();
  return INDIAN_RTO_STATE_CODES[upper] ?? upper;
}

export function normalizeSelectedServiceTypes(selected: string[]): RiderServiceTypeValue[] {
  if (selected.includes("all")) {
    return [...RIDER_SERVICE_TYPE_VALUES];
  }
  return RIDER_SERVICE_TYPE_VALUES.filter((v) => selected.includes(v));
}

export function needsPersonRideFields(serviceTypes: string[]): boolean {
  return serviceTypes.includes("person_ride");
}

export function toggleServiceSelection(
  current: string[],
  value: string,
): string[] {
  if (value === "all") {
    const hasAll =
      current.includes("all") ||
      RIDER_SERVICE_TYPE_VALUES.every((v) => current.includes(v));
    return hasAll ? [] : ["all", ...RIDER_SERVICE_TYPE_VALUES];
  }

  let next = current.filter((v) => v !== "all");
  if (next.includes(value)) {
    next = next.filter((v) => v !== value);
  } else {
    next = [...next, value];
  }

  if (RIDER_SERVICE_TYPE_VALUES.every((v) => next.includes(v))) {
    return ["all", ...RIDER_SERVICE_TYPE_VALUES];
  }
  return next;
}

export function isServiceOptionSelected(current: string[], value: string): boolean {
  if (value === "all") {
    return (
      current.includes("all") ||
      RIDER_SERVICE_TYPE_VALUES.every((v) => current.includes(v))
    );
  }
  return current.includes(value);
}
