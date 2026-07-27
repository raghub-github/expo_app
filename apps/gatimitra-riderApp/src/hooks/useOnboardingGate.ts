// @ts-nocheck — pending strict-mode cleanup; tracked in follow-up issue.
import { useEffect, useMemo, useRef } from "react";
import { useSessionStore } from "@/src/stores/sessionStore";
import { useOnboardingStore } from "@/src/stores/onboardingStore";
import { useRiderStatus } from "@/src/hooks/useOnboarding";
import {
  canAccessHome,
  resolveEstablishedRiderHref,
  resolveOnboardingHref,
  type ServerOnboardingStep,
} from "@/src/lib/onboarding-routes";
import { isRiderNotFoundError } from "@/src/services/http";

export function useOnboardingGate() {
  const sessionHydrated = useSessionStore((s) => s.hydrated);
  const session = useSessionStore((s) => s.session);
  const setSession = useSessionStore((s) => s.setSession);
  const onboardingHydrated = useOnboardingStore((s) => s.hydrated);
  const riderId = useOnboardingStore((s) => s.data.riderId);
  const currentStep = useOnboardingStore((s) => s.data.currentStep);
  const vehicleChoice = useOnboardingStore((s) => s.data.vehicleChoice);
  const vehicleOnboardingFlow = useOnboardingStore((s) => s.data.vehicleOnboardingFlow);
  const vehicleOnboardingSubmittedFor = useOnboardingStore(
    (s) => s.data.vehicleOnboardingSubmittedFor
  );
  const bankAccountOnboardingDone = useOnboardingStore(
    (s) => s.data.bankAccountOnboardingDone
  );
  const cachedOnboardingStatus = useOnboardingStore((s) => s.data.cachedOnboardingStatus);
  const cachedAccountStatus = useOnboardingStore((s) => s.data.cachedAccountStatus);
  const cachedApprovalStatus = useOnboardingStore((s) => s.data.cachedApprovalStatus);
  const setData = useOnboardingStore((s) => s.setData);
  const setStep = useOnboardingStore((s) => s.setStep);
  const clearOnboarding = useOnboardingStore((s) => s.clear);
  const hydrateOnboarding = useOnboardingStore((s) => s.hydrate);
  const hydrateSession = useSessionStore((s) => s.hydrate);
  const clearedStaleRiderRef = useRef(false);

  useEffect(() => {
    void hydrateSession();
    void hydrateOnboarding();
  }, [hydrateSession, hydrateOnboarding]);

  const { data: riderStatus, isError, error, isFetched } = useRiderStatus(riderId);
  const riderNotFound = isError && isRiderNotFoundError(error);

  const serverStep = (riderStatus?.nextOnboardingStep ?? null) as ServerOnboardingStep | null;

  const completedOnboardingSteps = useMemo(() => {
    const base = riderStatus?.completedOnboardingSteps ?? [];
    if (riderStatus?.selfieUrl && !base.includes("pan_selfie")) {
      return [...base, "pan_selfie"];
    }
    return base;
  }, [riderStatus?.completedOnboardingSteps, riderStatus?.selfieUrl]);

  const effectiveOnboardingStatus =
    riderStatus?.onboardingStatus ?? cachedOnboardingStatus ?? null;
  const effectiveAccountStatus = riderStatus?.accountStatus ?? cachedAccountStatus ?? null;
  const effectiveApprovalStatus = riderStatus?.approvalStatus ?? cachedApprovalStatus ?? null;

  // Persist access fields so cold start can skip Aadhaar for approved riders.
  useEffect(() => {
    if (!riderStatus?.onboardingStatus) return;
    const next = {
      cachedOnboardingStatus: riderStatus.onboardingStatus,
      cachedAccountStatus: riderStatus.accountStatus ?? undefined,
      cachedApprovalStatus: riderStatus.approvalStatus ?? undefined,
    };
    if (
      next.cachedOnboardingStatus === cachedOnboardingStatus &&
      next.cachedAccountStatus === cachedAccountStatus &&
      next.cachedApprovalStatus === cachedApprovalStatus
    ) {
      return;
    }
    void setData(next);
  }, [
    riderStatus?.onboardingStatus,
    riderStatus?.accountStatus,
    riderStatus?.approvalStatus,
    cachedOnboardingStatus,
    cachedAccountStatus,
    cachedApprovalStatus,
    setData,
  ]);

  // Stale local riderId (deleted from DB) — clear cached onboarding and sign out.
  useEffect(() => {
    if (!riderNotFound || clearedStaleRiderRef.current) return;
    clearedStaleRiderRef.current = true;
    void (async () => {
      await clearOnboarding();
      await setSession(null);
    })();
  }, [riderNotFound, clearOnboarding, setSession]);

  // Keep local store aligned when DB shows further doc progress (never sync to "payment").
  useEffect(() => {
    if (!serverStep || serverStep === "method_selection" || serverStep === "payment") return;
    if (serverStep === currentStep) return;

    const order = ["aadhaar_name", "pan_selfie", "dl_rc", "rental_ev"];
    const serverIdx = order.indexOf(serverStep);
    const localIdx = currentStep ? order.indexOf(currentStep) : -1;
    if (serverIdx >= 0 && serverIdx > localIdx) {
      void setStep(serverStep as typeof currentStep);
    }
  }, [serverStep, currentStep, setStep]);

  const ready = useMemo(() => {
    if (!sessionHydrated || !onboardingHydrated) return false;
    if (!session) return true;
    if (riderNotFound) return true;
    if (!riderId) return true;
    // Known established rider (live or cached) → route home without waiting.
    if (
      resolveEstablishedRiderHref(
        effectiveOnboardingStatus,
        effectiveAccountStatus,
        effectiveApprovalStatus,
        {
          paymentCompleted: riderStatus?.paymentCompleted,
          nextOnboardingStep: serverStep,
        }
      )
    ) {
      return true;
    }
    // Wait for first status fetch so we never flash Aadhaar for approved riders.
    if (!isFetched) return false;
    return true;
  }, [
    sessionHydrated,
    onboardingHydrated,
    session,
    riderId,
    riderNotFound,
    effectiveOnboardingStatus,
    effectiveAccountStatus,
    effectiveApprovalStatus,
    isFetched,
    riderStatus?.paymentCompleted,
    serverStep,
  ]);

  const href = useMemo(() => {
    if (!session) return null;
    if (riderNotFound) return "/(auth)/login" as const;
    if (!riderId) return "/(auth)/login" as const;
    return resolveOnboardingHref(effectiveOnboardingStatus, currentStep, serverStep, {
      vehicleChoice,
      vehicleOnboardingFlow,
      vehicleOnboardingSubmittedFor,
      bankAccountOnboardingDone,
      accountStatus: effectiveAccountStatus,
      completedOnboardingSteps,
      approvalStatus: effectiveApprovalStatus,
      paymentCompleted: riderStatus?.paymentCompleted,
    });
  }, [
    session,
    riderId,
    effectiveOnboardingStatus,
    currentStep,
    serverStep,
    riderNotFound,
    vehicleChoice,
    vehicleOnboardingFlow,
    vehicleOnboardingSubmittedFor,
    bankAccountOnboardingDone,
    effectiveAccountStatus,
    completedOnboardingSteps,
    effectiveApprovalStatus,
    riderStatus?.paymentCompleted,
  ]);

  const canAccessTabs = canAccessHome(effectiveOnboardingStatus, effectiveAccountStatus);

  return {
    ready,
    href,
    canAccessTabs,
    session,
    onboardingStatus: effectiveOnboardingStatus,
    nextOnboardingStep: serverStep,
    riderNotFound,
  };
}
