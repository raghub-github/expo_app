/**
 * Map dashboard verification steps (1–8) to partner onboarding `step` in register-store (1–9).
 *
 * Dashboard (after bank split migration): 1 info, 2 location, 3 menu, 4 docs, 5 ops,
 * 6 bank account, 7 commission plan, 8 sign & submit.
 *
 * Partner: bank / payout details are edited under Step 4 (documents) via `step4.bank`.
 */
export function verificationStepToPartnerStep(verificationStep: number): number {
  const v = Math.floor(verificationStep);
  if (v <= 1) return 1;
  if (v === 2) return 2;
  if (v === 3) return 3;
  if (v === 4) return 4;
  if (v === 5) return 5;
  if (v === 6) return 4;
  if (v === 7) return 7;
  if (v >= 8) return 9;
  return 1;
}
