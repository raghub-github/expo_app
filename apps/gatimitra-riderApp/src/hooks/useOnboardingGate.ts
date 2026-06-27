// @ts-nocheck — pending strict-mode cleanup; tracked in follow-up issue.
import { useEffect, useMemo, useRef } from "react";
import { useSessionStore } from "@/src/stores/sessionStore";
import { useOnboardingStore } from "@/src/stores/onboardingStore";
import { useRiderStatus } from "@/src/hooks/useOnboarding";
import {
  canAccessHome,
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
  const setStep = useOnboardingStore((s) => s.setStep);
  const clearOnboarding = useOnboardingStore((s) => s.clear);
  const hydrateOnboarding = useOnboardingStore((s) => s.hydrate);
  const hydrateSession = useSessionStore((s) => s.hydrate);
  const clearedStaleRiderRef = useRef(false);

  useEffect(() => {
    void hydrateSession();
    void hydrateOnboarding();
  }, [hydrateSession, hydrateOnboarding]);

  const { data: riderStatus, isLoading, isError, error } = useRiderStatus(riderId);
  const riderNotFound = isError && isRiderNotFoundError(error);

  const serverStep = (riderStatus?.nextOnboardingStep ?? null) as ServerOnboardingStep | null;

  const completedOnboardingSteps = useMemo(() => {
    const base = riderStatus?.completedOnboardingSteps ?? [];
    if (riderStatus?.selfieUrl && !base.includes("pan_selfie")) {
      return [...base, "pan_selfie"];
    }
    return base;
  }, [riderStatus?.completedOnboardingSteps, riderStatus?.selfieUrl]);

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
    // Only block on the first load — background refetches must not blank the home screen.
    if (isLoading && !riderStatus) return false;
    return true;
  }, [sessionHydrated, onboardingHydrated, session, riderId, riderNotFound, isLoading, riderStatus]);

  const href = useMemo(() => {
    if (!session) return null;
    if (riderNotFound) return "/(auth)/login" as const;
    if (!riderId) return "/(auth)/login" as const;
    return resolveOnboardingHref(riderStatus?.onboardingStatus, currentStep, serverStep, {
      vehicleChoice,
      vehicleOnboardingFlow,
      vehicleOnboardingSubmittedFor,
      accountStatus: riderStatus?.accountStatus,
      completedOnboardingSteps,
      approvalStatus: riderStatus?.approvalStatus,
    });
  }, [
    session,
    riderId,
    riderStatus?.onboardingStatus,
    currentStep,
    serverStep,
    riderNotFound,
    vehicleChoice,
    vehicleOnboardingFlow,
    vehicleOnboardingSubmittedFor,
    riderStatus?.accountStatus,
    completedOnboardingSteps,
    riderStatus?.approvalStatus,
  ]);

  const canAccessTabs = canAccessHome(riderStatus?.onboardingStatus, riderStatus?.accountStatus);

  return {
    ready,
    href,
    canAccessTabs,
    session,
    onboardingStatus: riderStatus?.onboardingStatus,
    nextOnboardingStep: serverStep,
    riderNotFound,
  };
}
