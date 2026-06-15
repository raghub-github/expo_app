const PLACEHOLDER_TOKENS = new Set(["—", "–", "-", "n/a", "na", "null", "none", "unknown", ""]);

export function normalizeGeoHint(value: string | null | undefined): string | undefined {
  if (!value) return undefined;
  const t = value.trim();
  if (!t || PLACEHOLDER_TOKENS.has(t.toLowerCase())) return undefined;
  return t;
}

export function pickupGeoHintsFromAddress(
  address: { pincode?: string | null; state?: string | null } | null | undefined
): { pickupPincode?: string; pickupState?: string } {
  const pickupPincode = normalizeGeoHint(address?.pincode);
  const pickupState = normalizeGeoHint(address?.state);
  return {
    ...(pickupPincode ? { pickupPincode } : {}),
    ...(pickupState ? { pickupState } : {}),
  };
}
