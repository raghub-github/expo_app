/** Dashboard / partner verification step titles (1–8). Keep in sync with dashboard store-verification-path. */
export const STORE_VERIFICATION_STEP_LABELS: Record<number, string> = {
  1: "Restaurant information",
  2: "Location details",
  3: "Menu setup",
  4: "Restaurant documents",
  5: "Operational details",
  6: "Bank account",
  7: "Commission plan",
  8: "Sign & submit",
};

export function storeVerificationStepLabel(
  step: number,
  fallbackLabel?: string | null
): string {
  const fromDb = typeof fallbackLabel === "string" ? fallbackLabel.trim() : "";
  if (fromDb) return fromDb;
  return STORE_VERIFICATION_STEP_LABELS[step] ?? `Step ${step}`;
}
