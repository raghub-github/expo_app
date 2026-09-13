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
import { normalizeRiderId, riderIdFromSession } from "@/src/utils/normalizeRiderId";

export function useOnboardingGate() {
  const sessionHydrated = useSessionStore((s) => s.hydrated);
  const session = useSessionStore((s) => s.session);
  const setSession = useSessionStore((s) => s.setSession);
  const onboardingHydrated = useOnboardingStore((s) => s.hydrated);
  const boundOwnerId = useOnboardingStore((s) => s.boundOwnerId);
  const onboardingRiderId = useOnboardingStore((s) => s.data.riderId);
  /** Prefer numeric rider PK from session; never use raw usr_* for status APIs. */
  const riderId =
    normalizeRiderId(onboardingRiderId) ??
    riderIdFromSession(session) ??
    undefined;
  const currentStep = useOnboardingStore((s) => s.data.currentStep);
  const vehicleChoice = useOnboardingStore((s) => s.data.vehicleChoice);
  const vehicleOnboardingFlow = useOnboardingStore((s) => s.data.vehicleOnboardingFlow);
  const vehicleOnboardingSubmittedFor = useOnboardingStore(
    (s) => s.data.vehicleOnboardingSubmittedFor
  );
  const skippedOnboardingDocs = useOnboardingStore((s) => s.data.skippedOnboardingDocs);
  const bankAccountOnboardingDone = useOnboardingStore(
    (s) => s.data.bankAccountOnboardingDone
  );
  const bankAccountOnboardingSkipped = useOnboardingStore(
    (s) => s.data.bankAccountOnboardingSkipped
  );
  const referralPromptHandled = useOnboardingStore((s) => s.data.referralPromptHandled);
  const locationSource = useOnboardingStore((s) => s.data.locationSource);
  const localState = useOnboardingStore((s) => s.data.state);
  const localDistrict = useOnboardingStore((s) => s.data.district);
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
    return riderStatus?.completedOnboardingSteps ?? [];
  }, [riderStatus?.completedOnboardingSteps]);

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

  // Dashboard-completed steps: copy server vehicle/bank flags into local store
  // so payment / bank screens do not bounce the rider back to upload.
  useEffect(() => {
    if (!riderStatus) return;
    const patch: Record<string, unknown> = {};
    const serverChoice = String(riderStatus.vehicleChoice || "").trim();
    if (serverChoice && serverChoice !== vehicleChoice) {
      patch.vehicleChoice = serverChoice;
    }
    const serverCat = String(riderStatus.vehicleCategoryCode || "").trim();
    if (serverCat) {
      patch.vehicleCategoryCode = serverCat;
    }
    const serverFlow = riderStatus.vehicleOnboardingFlow;
    if (serverFlow === "dl_rc" || serverFlow === "rental_ev" || serverFlow === "payment") {
      if (serverFlow !== vehicleOnboardingFlow) {
        patch.vehicleOnboardingFlow = serverFlow;
      }
    }
    const serverSubmitted = String(riderStatus.vehicleDocsSubmittedFor || "").trim();
    if (serverSubmitted && serverSubmitted !== vehicleOnboardingSubmittedFor) {
      patch.vehicleOnboardingSubmittedFor = serverSubmitted;
    }
    const serverSkipped = Array.isArray(riderStatus.skippedOnboardingDocs)
      ? riderStatus.skippedOnboardingDocs.map((c) => String(c || "").trim()).filter(Boolean)
      : [];
    if (serverSkipped.length) {
      const localSkipped = skippedOnboardingDocs ?? [];
      const merged = Array.from(new Set([...localSkipped, ...serverSkipped]));
      if (
        merged.length !== localSkipped.length ||
        merged.some((c) => !localSkipped.includes(c))
      ) {
        patch.skippedOnboardingDocs = merged;
      }
    }
    if (riderStatus.bankAccountOnboardingDone && !bankAccountOnboardingDone) {
      patch.bankAccountOnboardingDone = true;
    }
    if (riderStatus.bankAccountOnboardingSkipped === true) {
      if (!bankAccountOnboardingSkipped) patch.bankAccountOnboardingSkipped = true;
      if (!bankAccountOnboardingDone) patch.bankAccountOnboardingDone = true;
    }
    const ha = riderStatus.homeAddress;
    // Never clobber a locally persisted MANUAL / OTHER selection with stale GPS home address.
    const localSource = locationSource;
    const localManual =
      localSource === "manual_select" || localSource === "manual_other";
    const serverSource = ha && typeof ha === "object" ? String(ha.locationSource || "") : "";
    if (ha && typeof ha === "object") {
      if (localManual && serverSource !== "manual_select" && serverSource !== "manual_other") {
        // Keep local manual fields; only sync if server also has a newer manual source.
      } else {
        if (ha.state && ha.state !== localState) patch.state = ha.state;
        if (ha.region) patch.region = ha.region;
        if (ha.district) patch.district = ha.district;
        if (ha.city) patch.city = ha.city;
        if (ha.pincode) patch.pincode = ha.pincode;
        if (ha.address) patch.address = ha.address;
        if (ha.lat != null) patch.lat = ha.lat;
        if (ha.lon != null) patch.lon = ha.lon;
        if (ha.stateId) patch.stateId = ha.stateId;
        if (ha.regionId) patch.regionId = ha.regionId;
        if (ha.districtId) patch.districtId = ha.districtId;
        if (ha.locationSource) patch.locationSource = ha.locationSource;
        if (ha.locationOtherState) patch.locationOtherState = ha.locationOtherState;
        if (ha.locationOtherDistrict) patch.locationOtherDistrict = ha.locationOtherDistrict;
      }
    }
    if (Object.keys(patch).length === 0) return;
    void setData(patch);
  }, [
    riderStatus?.vehicleChoice,
    riderStatus?.vehicleCategoryCode,
    riderStatus?.vehicleOnboardingFlow,
    riderStatus?.vehicleDocsSubmittedFor,
    riderStatus?.skippedOnboardingDocs,
    riderStatus?.bankAccountOnboardingDone,
    riderStatus?.bankAccountOnboardingSkipped,
    riderStatus?.homeAddress,
    riderStatus?.workLocationConfirmed,
    vehicleChoice,
    vehicleOnboardingFlow,
    vehicleOnboardingSubmittedFor,
    skippedOnboardingDocs,
    bankAccountOnboardingDone,
    bankAccountOnboardingSkipped,
    localState,
    locationSource,
    setData,
  ]);

  // Stale local riderId (deleted from DB) — clear cached onboarding and sign out.
  useEffect(() => {
    if (!riderNotFound || clearedStaleRiderRef.current) return;
    clearedStaleRiderRef.current = true;
    void (async () => {
      try {
        await clearOnboarding();
      } catch {
        /* ignore */
      }
      await setSession(null);
      try {
        const { router } = await import("expo-router");
        router.replace("/(auth)/login");
      } catch {
        /* index gate will also route to login */
      }
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
    // Wait until bindOwner attaches this session — do NOT treat empty riderId as
    // "ready → login" (that caused kill→reopen to flash OTP before restore finished).
    if (!boundOwnerId && !riderId) return false;
    if (!riderId) return false;
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
    boundOwnerId,
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
    // Still binding owner / resolving numeric rider id — keep splash, never login.
    if (!riderId) return null;
    // Server-confirmed only. Local locationSource is a draft until work-location POST succeeds
    // (and hiring allows it) — otherwise riders skip location and reach payment while NOT_HIRING.
    const workLocationConfirmed = riderStatus?.workLocationConfirmed === true;
    return resolveOnboardingHref(effectiveOnboardingStatus, currentStep, serverStep, {
      vehicleChoice: vehicleChoice || riderStatus?.vehicleChoice || undefined,
      vehicleOnboardingFlow:
        vehicleOnboardingFlow ||
        (riderStatus?.vehicleOnboardingFlow === "dl_rc" ||
        riderStatus?.vehicleOnboardingFlow === "rental_ev" ||
        riderStatus?.vehicleOnboardingFlow === "payment"
          ? riderStatus.vehicleOnboardingFlow
          : undefined),
      vehicleOnboardingSubmittedFor:
        vehicleOnboardingSubmittedFor || riderStatus?.vehicleDocsSubmittedFor || undefined,
      bankAccountOnboardingDone:
        bankAccountOnboardingDone || riderStatus?.bankAccountOnboardingDone,
      accountStatus: effectiveAccountStatus,
      completedOnboardingSteps,
      approvalStatus: effectiveApprovalStatus,
      paymentCompleted: riderStatus?.paymentCompleted,
      referralPromptHandled,
      workLocationConfirmed,
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
    riderStatus?.vehicleChoice,
    riderStatus?.vehicleOnboardingFlow,
    riderStatus?.vehicleDocsSubmittedFor,
    riderStatus?.bankAccountOnboardingDone,
    riderStatus?.workLocationConfirmed,
    riderStatus?.homeAddress?.districtId,
    referralPromptHandled,
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
