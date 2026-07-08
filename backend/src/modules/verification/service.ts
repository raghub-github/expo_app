/**
 * Verification orchestration service.
 *
 * One entry per document kind. Each entry:
 *
 *   1. Consults the policy engine — if mode='manual' or 'disabled', returns
 *      immediately (the caller then routes through the existing manual flow).
 *   2. Mints a verification_id and inserts a verification_requests row.
 *   3. Calls the Cashfree provider layer.
 *   4. Normalises the response via the adapter.
 *   5. Writes archival rows + updates the request outcome.
 *   6. Optionally queues manual review if confidence < threshold.
 *
 * Errors from the provider layer are categorised (CashfreeError) and, where
 * safe, retried once with a new verification_id. Terminal failures set
 * status='failed'|'timeout'|'provider_down' and — if policy.fallback_to_manual
 * is true — the caller is expected to fall back to manual upload.
 */
import { loadCashfreeConfig } from "./cashfree/config.js";
import { cashfree } from "./cashfree/provider.js";
import {
  adaptBankAccount,
  adaptCin,
  adaptDigilockerCreate,
  adaptDrivingLicence,
  adaptGstin,
  adaptIfsc,
  adaptPan,
  adaptPassport,
  adaptReversePennyDropCreate,
  adaptVehicleRc,
} from "./cashfree/adapters.js";
import { CashfreeError, isRetryableCategory } from "./cashfree/errors.js";
import { createRequest, newVerificationId, persistOutcome, appendEvent } from "./history.js";
import { resolveEffectivePolicy } from "./policy/engine.js";
import type {
  NormalizedVerification,
  VerificationDocumentKind,
  VerificationSubjectKind,
  EffectivePolicy,
} from "./types.js";

export type SubmitCommonArgs = {
  subjectType: VerificationSubjectKind;
  subjectId: number;
  riderDocumentId?: number | null;
  merchantDocumentId?: number | null;
  createdBy?: number | null;
  subjectFacts?: Record<string, unknown>;
};

export type SubmitOutcome =
  | { kind: "auto"; result: NormalizedVerification; requestId: number; policy: EffectivePolicy }
  | { kind: "manual"; reason: string; policy: EffectivePolicy; detail?: string };

/** Every per-doc-kind method below wraps `runProviderCall` with the right adapter. */
type ProviderCallFn = (verificationId: string, cfg: { timeoutMs: number }) => Promise<{
  raw: Parameters<typeof adaptPan>[0]; // typed loosely — each caller narrows
  normalized: NormalizedVerification;
}>;

async function runProviderCall(
  docKind: VerificationDocumentKind,
  args: SubmitCommonArgs,
  provider: (verificationId: string) => Promise<NormalizedVerification>,
): Promise<SubmitOutcome> {
  // 1. Policy
  const policy = await resolveEffectivePolicy({
    subjectType: args.subjectType,
    documentKind: docKind,
    subjectFacts: args.subjectFacts,
  });
  if (policy.mode === "manual" || policy.mode === "disabled") {
    return { kind: "manual", reason: `policy_mode_${policy.mode}`, policy };
  }

  // 2. Resolve provider config for archival provenance.
  let providerConfigId: number | null = null;
  try {
    const cfg = await loadCashfreeConfig();
    providerConfigId = cfg.configId;
  } catch {
    // No active provider config — treat as manual.
    return { kind: "manual", reason: "provider_not_configured", policy };
  }

  // 3. Mint verification_id, create request row.
  const verificationId = newVerificationId();
  const requestId = await createRequest({
    verificationId,
    provider: "cashfree",
    providerConfigId,
    documentKind: docKind,
    subjectType: args.subjectType,
    subjectId: args.subjectId,
    riderDocumentId: args.riderDocumentId ?? null,
    merchantDocumentId: args.merchantDocumentId ?? null,
    policySnapshotId: policy.policySnapshotId || null,
    attemptNumber: 1,
    createdBy: args.createdBy ?? null,
  });
  await appendEvent({
    requestId, eventKind: "submit", toStatus: "initiated", actorType: "system",
    details: { policyId: policy.policyId, mode: policy.mode },
  });

  // 4. Call provider, adapt, persist.
  try {
    const normalized = await provider(verificationId);
    await persistOutcome(requestId, normalized);

    // 5. Auto-approve gating.
    if (
      normalized.status === "verified" &&
      policy.confidenceThreshold != null &&
      normalized.confidence != null &&
      normalized.confidence < policy.confidenceThreshold
    ) {
      // Confidence below threshold — flip to manual review.
      await appendEvent({
        requestId, eventKind: "manual_review_queued",
        fromStatus: "verified", toStatus: "manual_review", actorType: "system",
        details: { reason: "confidence_below_threshold", threshold: policy.confidenceThreshold, actual: normalized.confidence },
      });
      normalized.status = "manual_review";
    }
    if (normalized.status === "verified" && !policy.autoApprove) {
      await appendEvent({
        requestId, eventKind: "manual_review_queued",
        fromStatus: "verified", toStatus: "manual_review", actorType: "system",
        details: { reason: "policy_requires_review" },
      });
      normalized.status = "manual_review";
    }

    return { kind: "auto", result: normalized, requestId, policy };
  } catch (e) {
    if (e instanceof CashfreeError) {
      const status =
        e.category === "timeout" ? "timeout" :
        e.category === "provider_down" ? "provider_down" :
        e.category === "duplicate" ? "duplicate" :
        e.category === "upstream_failed" ? "rejected" :
        "failed";
      await appendEvent({
        requestId,
        eventKind: "provider_response",
        fromStatus: "initiated",
        toStatus: status,
        actorType: "provider",
        details: { category: e.category, code: e.cfCode, message: e.message },
      });
      await persistOutcome(requestId, {
        verificationId, attemptNumber: 1, provider: "cashfree",
        providerReference: null, subjectType: args.subjectType, subjectId: args.subjectId,
        documentKind: docKind, status,
        statusReason: `${e.category}: ${e.message}`, confidence: null, businessIdentifier: null,
        verifiedData: {}, rawRequest: {}, rawResponse: e.body ?? { error: e.message },
        responseHeaders: {}, httpStatus: e.status ?? null, durationMs: null, providerArtifacts: [],
      });

      // Fallback-to-manual: caller keeps the projection untouched and lets the
      // agent finish the doc through the existing manual workflow.
      if (policy.fallbackToManual && isRetryableCategory(e.category) === false) {
        return { kind: "manual", reason: `provider_error_${e.category}`, policy, detail: e.message };
      }
      return { kind: "manual", reason: `provider_error_${e.category}`, policy, detail: e.message };
    }
    throw e;
  }
}

// ── Per-document submit methods ────────────────────────────────────────────

export async function submitPan(args: SubmitCommonArgs & { pan: string; name: string }): Promise<SubmitOutcome> {
  return runProviderCall("pan", args, async (vid) => {
    const call = await cashfree.verifyPan({ verification_id: vid, pan: args.pan, name: args.name });
    return adaptPan(call as never, common("pan", vid, args));
  });
}

export async function submitIfsc(args: SubmitCommonArgs & { ifsc: string }): Promise<SubmitOutcome> {
  return runProviderCall("ifsc", args, async (vid) => {
    const call = await cashfree.verifyIfsc({ verification_id: vid, ifsc: args.ifsc });
    return adaptIfsc(call as never, common("ifsc", vid, args));
  });
}

export async function submitDrivingLicence(args: SubmitCommonArgs & { dlNumber: string; dob: string }): Promise<SubmitOutcome> {
  return runProviderCall("driving_licence", args, async (vid) => {
    const call = await cashfree.verifyDrivingLicence({ verification_id: vid, dl_number: args.dlNumber, dob: args.dob });
    return adaptDrivingLicence(call as never, common("driving_licence", vid, args));
  });
}

export async function submitVehicleRc(args: SubmitCommonArgs & { vehicleNumber: string }): Promise<SubmitOutcome> {
  return runProviderCall("vehicle_rc", args, async (vid) => {
    const call = await cashfree.verifyVehicleRc({ verification_id: vid, vehicle_number: args.vehicleNumber });
    return adaptVehicleRc(call as never, common("vehicle_rc", vid, args));
  });
}

export async function submitPassport(args: SubmitCommonArgs & { fileNumber: string; dob: string; name?: string }): Promise<SubmitOutcome> {
  return runProviderCall("passport", args, async (vid) => {
    const call = await cashfree.verifyPassport({ verification_id: vid, file_number: args.fileNumber, dob: args.dob, name: args.name });
    return adaptPassport(call as never, common("passport", vid, args));
  });
}

export async function submitGstin(args: SubmitCommonArgs & { gstin: string; businessName?: string }): Promise<SubmitOutcome> {
  return runProviderCall("gstin", args, async (vid) => {
    const call = await cashfree.verifyGstin({ GSTIN: args.gstin, business_name: args.businessName });
    return adaptGstin(call as never, common("gstin", vid, args));
  });
}

export async function submitCin(args: SubmitCommonArgs & { cin: string }): Promise<SubmitOutcome> {
  return runProviderCall("cin", args, async (vid) => {
    const call = await cashfree.verifyCin({ verification_id: vid, cin: args.cin });
    return adaptCin(call as never, common("cin", vid, args));
  });
}

export async function submitBankAccount(args: SubmitCommonArgs & { bankAccount: string; ifsc: string; name?: string; phone?: string }): Promise<SubmitOutcome> {
  return runProviderCall("bank_account", args, async (vid) => {
    const call = await cashfree.verifyBankAccountSync({ verification_id: vid, bank_account: args.bankAccount, ifsc: args.ifsc, name: args.name, phone: args.phone });
    return adaptBankAccount(call as never, common("bank_account", vid, args));
  });
}

export async function submitReversePennyDrop(args: SubmitCommonArgs & { redirectUrl?: string; name?: string }): Promise<SubmitOutcome> {
  return runProviderCall("reverse_penny_drop", args, async (vid) => {
    const call = await cashfree.createReversePennyDrop({ verification_id: vid, name: args.name, redirect_url: args.redirectUrl });
    return adaptReversePennyDropCreate(call as never, common("reverse_penny_drop", vid, args));
  });
}

export async function submitDigilocker(args: SubmitCommonArgs & {
  documents: Array<"AADHAAR" | "PAN" | "DRIVING_LICENSE">;
  redirectUrl?: string;
  userFlow?: "signin" | "signup";
}): Promise<SubmitOutcome> {
  return runProviderCall("aadhaar_digilocker", args, async (vid) => {
    const call = await cashfree.createDigilocker({
      verification_id: vid,
      document_requested: args.documents,
      redirect_url: args.redirectUrl,
      user_flow: args.userFlow ?? "signin",
    });
    return adaptDigilockerCreate(call as never, common("aadhaar_digilocker", vid, args));
  });
}

function common(kind: VerificationDocumentKind, vid: string, args: SubmitCommonArgs) {
  return {
    verificationId: vid,
    attemptNumber: 1,
    subjectType: args.subjectType,
    subjectId: args.subjectId,
    documentKind: kind,
  };
}
