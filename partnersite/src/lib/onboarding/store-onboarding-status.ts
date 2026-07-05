export type StoreOnboardingSnapshot = {
  approval_status?: string | null;
  onboarding_completed?: boolean | null;
  current_onboarding_step?: number | null;
  verification_step_rejections?: { merchant_resubmitted_at?: string | null }[] | null;
};

const SUBMITTED_STATUSES = new Set(["SUBMITTED", "UNDER_VERIFICATION", "PENDING_VERIFICATION"]);

export function isStoreOnboardingSubmitted(store: StoreOnboardingSnapshot): boolean {
  if (store.onboarding_completed === true) return true;
  const status = String(store.approval_status || "").toUpperCase();
  return SUBMITTED_STATUSES.has(status);
}

export function storeHasOpenVerificationFix(store: StoreOnboardingSnapshot): boolean {
  const rejections = store.verification_step_rejections;
  if (!Array.isArray(rejections) || rejections.length === 0) return false;
  return rejections.some((r) => !r.merchant_resubmitted_at);
}

/** True when merchant still needs to finish or resume onboarding (signature, draft steps, etc.). */
export function storeNeedsOnboardingAction(store: StoreOnboardingSnapshot): boolean {
  const status = String(store.approval_status || "").toUpperCase();
  if (status === "APPROVED") return false;
  if (isStoreOnboardingSubmitted(store)) return false;
  if (storeHasOpenVerificationFix(store)) return true;
  if (status === "REJECTED") return storeHasOpenVerificationFix(store);
  if (status === "DRAFT") return true;
  const step = store.current_onboarding_step;
  return typeof step === "number" && step < 9;
}

export function getStoreOnboardingBadge(store: StoreOnboardingSnapshot): { label: string; className: string } {
  if (storeNeedsOnboardingAction(store)) {
    return { label: "Pending", className: "bg-emerald-500 text-white" };
  }
  const status = String(store.approval_status || "").toUpperCase();
  if (status === "APPROVED") return { label: "Verified", className: "bg-emerald-100 text-emerald-800" };
  if (status === "REJECTED") return { label: "Rejected", className: "bg-red-100 text-red-800" };
  if (isStoreOnboardingSubmitted(store) || status === "UNDER_VERIFICATION") {
    return { label: "Under review", className: "bg-amber-100 text-amber-800" };
  }
  return { label: store.approval_status || "Pending", className: "bg-slate-100 text-slate-700" };
}
