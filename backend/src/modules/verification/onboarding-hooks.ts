/**
 * Post-save hooks that fire verification submits after the rider onboarding
 * /save-step endpoint accepts a document number.
 *
 * Design:
 *   - The hook is fire-and-forget. If the provider layer is slow or errors,
 *     onboarding /save-step still returns success — the rider is not blocked.
 *   - Every submit consults the policy engine first (§F service.ts), so if
 *     the (subject_type, doc_kind) slot is on mode='manual' (the default),
 *     nothing happens and the manual flow runs unchanged.
 *   - Errors are logged, never thrown.
 *
 * Called from backend/src/modules/onboarding/onboarding.routes.ts inside
 * the /save-step handler after the rider record is updated.
 */
import type { FastifyBaseLogger } from "fastify";
import { submitPan, submitDrivingLicence, submitVehicleRc } from "./service.js";

export type OnboardingStep =
  | "aadhaar_name"
  | "dl_rc"
  | "rental_ev"
  | "pan_selfie"
  | "location";

/**
 * Kick off any verification the just-saved step is now eligible for.
 * Only doc kinds with a policy in mode ∈ {auto, hybrid} actually fire —
 * everything else is a no-op via the policy engine.
 */
export async function triggerRiderOnboardingVerifications(
  ctx: {
    logger: FastifyBaseLogger;
    riderId: number;
    step: OnboardingStep;
    hasOwnVehicle: boolean;
  },
  data: {
    aadhaarNumber?: string;
    fullName?: string;
    panNumber?: string;
    dlNumber?: string;
    rcNumber?: string;
    dob?: string;
  },
): Promise<void> {
  const facts = { has_own_vehicle: ctx.hasOwnVehicle };

  const runs: Array<Promise<unknown>> = [];

  // PAN: fires on pan_selfie step when panNumber + fullName present.
  if (ctx.step === "pan_selfie" && data.panNumber && data.fullName) {
    runs.push(
      submitPan({
        subjectType: "rider",
        subjectId: ctx.riderId,
        subjectFacts: facts,
        pan: data.panNumber.trim().toUpperCase(),
        name: data.fullName.trim(),
      }).catch((e: Error) => {
        ctx.logger.warn({ err: e.message, riderId: ctx.riderId }, "rider_pan_auto_verify_failed");
      }),
    );
  }

  // DL: fires on dl_rc step when dlNumber + dob known.
  if (ctx.step === "dl_rc" && data.dlNumber && data.dob) {
    runs.push(
      submitDrivingLicence({
        subjectType: "rider",
        subjectId: ctx.riderId,
        subjectFacts: facts,
        dlNumber: data.dlNumber.trim().toUpperCase(),
        dob: data.dob,
      }).catch((e: Error) => {
        ctx.logger.warn({ err: e.message, riderId: ctx.riderId }, "rider_dl_auto_verify_failed");
      }),
    );
  }

  // RC: fires on dl_rc step when rcNumber present.
  if (ctx.step === "dl_rc" && data.rcNumber) {
    runs.push(
      submitVehicleRc({
        subjectType: "rider",
        subjectId: ctx.riderId,
        subjectFacts: facts,
        vehicleNumber: data.rcNumber.trim().toUpperCase(),
      }).catch((e: Error) => {
        ctx.logger.warn({ err: e.message, riderId: ctx.riderId }, "rider_rc_auto_verify_failed");
      }),
    );
  }

  // Aadhaar DigiLocker is interactive (browser consent) — started from the
  // rider app Step 1 via POST /v1/onboarding/verify-document (docKind=aadhaar).
  // Do not auto-trigger DigiLocker here on save-step.

  await Promise.allSettled(runs);
}
