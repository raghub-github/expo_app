/**
 * When a merchant explicitly finishes fixing a rejected verification step, mark those steps so the
 * dashboard can show "Verify again" (`merchant_resubmitted_at` on `store_verification_step_rejections`).
 * Intermediate saves during fix (`preserveProgressPosition` without `signalVerificationResubmission`) skip this
 * so partner child-store Status / Step / Action stay unchanged until final Save on the locked step.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Map register-store-progress `formDataPatch` keys → dashboard verification steps (1–8).
 * Note: `form_data.step6` is partner **preview** (not dashboard step 6 bank).
 */
export function verificationStepsFromFormDataPatch(
  patch: Record<string, unknown> | null | undefined
): number[] {
  if (!patch || typeof patch !== "object") return [];
  const steps = new Set<number>();
  if (patch.step1 !== undefined) steps.add(1);
  if (patch.step2 !== undefined) steps.add(2);
  if (patch.step3 !== undefined) steps.add(3);
  if (patch.step4 !== undefined) steps.add(4);
  if (patch.step5 !== undefined) steps.add(5);
  if (patch.step7 !== undefined) steps.add(7);
  if (patch.step8 !== undefined) steps.add(8);
  if (patch.step9 !== undefined) steps.add(8);
  if (patch.final !== undefined) steps.add(8);
  return [...steps].sort((a, b) => a - b);
}

/**
 * Partner onboarding step (1–9) → dashboard verification steps (1–8) for `merchant_resubmitted_at`.
 * Step 4 UI covers documents (verification 4) and bank/UPI (verification 6).
 */
export function partnerOnboardingStepToVerificationResubmitSteps(partnerStep: number): number[] {
  const p = Math.floor(Number(partnerStep));
  if (!Number.isFinite(p) || p < 1) return [];
  if (p === 1) return [1];
  if (p === 2) return [2];
  if (p === 3) return [3];
  if (p === 4) return [4, 6];
  if (p === 5) return [5];
  if (p === 6) return [];
  if (p === 7) return [7];
  if (p === 8) return [8];
  if (p >= 9) return [8];
  return [];
}

export async function markMerchantResubmittedForRejectedSteps(
  db: SupabaseClient,
  storeDbId: number,
  verificationSteps: number[]
): Promise<void> {
  if (!Number.isFinite(storeDbId) || storeDbId <= 0 || verificationSteps.length === 0) return;
  try {
    const { error } = await db
      .from("store_verification_step_rejections")
      .update({ merchant_resubmitted_at: new Date().toISOString() })
      .eq("store_id", storeDbId)
      .in("step_number", verificationSteps);
    if (error) {
      console.warn("[verification-resubmission] Could not set merchant_resubmitted_at:", error.message);
    }
  } catch (e) {
    console.warn("[verification-resubmission] markMerchantResubmittedForRejectedSteps:", e);
  }
}
