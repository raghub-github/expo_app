import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Alert } from "react-native";
import * as Location from "expo-location";
import { ApiError } from "@gatimitra/sdk";
import { useDutyStore } from "@/src/stores/dutyStore";
import { riderApi } from "@/src/services/api/riderApi";
import {
  getJson,
  HttpError,
  isVehicleDetailsRequiredError,
  isVehicleNotVerifiedError,
} from "@/src/services/http";
import { getRiderAppConfig } from "@/src/config/env";
import { useSessionStore } from "@/src/stores/sessionStore";
import {
  riderVehicleQueryKey,
  type RiderVehicleStatusResponse,
} from "@/src/hooks/useRiderVehicle";
import { RIDER_VEHICLES_QUERY_KEY } from "@/src/hooks/useRiderVehicles";
import { useVehicleGateStore } from "@/src/stores/vehicleGateStore";
import {
  isRcApprovedForVehicleSheet,
  isRcManualReviewPending,
  isRcRejectedOrNeedsReupload,
} from "@/src/lib/rc-verification-state";
import { getOrCreateDeviceId } from "@/src/utils/deviceId";
import { resolveDutyServiceTypesForToggle } from "@/src/hooks/useRiderDutyServiceFilter";
import { useRiderSubscriptionStatus } from "@/src/hooks/useRiderSubscription";
import { useDutyStatus } from "@/src/hooks/useDutyStatus";
import { useEarningsSummary } from "@/src/hooks/useEarnings";
import {
  isRiderFullyDispatchBlocked,
  mergeRiderBlockedServices,
} from "@/src/lib/rider-blocked-services";
import { useRef, useState } from "react";
import type { RiderVehicleView } from "@/src/services/api/riderApi";
import { openDutyWorkLocationSheet } from "@/src/stores/dutyWorkLocationSheetStore";
import { useDutyVehiclePickStore } from "@/src/stores/dutyVehiclePickStore";
import { classifyRiderActionFailure } from "@/src/lib/rider-action-kind";
import { openDutyActionError } from "@/src/stores/dutyActionErrorStore";
import { isRiderNetworkOnline } from "@/src/stores/riderNetworkStore";
import {
  resolveDutyGoOnFailureKind,
  type DutyLocationFixResult,
} from "@/src/lib/dutyToggleFailure";
import { useOnboardingStore } from "@/src/stores/onboardingStore";
import { useRiderStatus } from "@/src/hooks/useOnboarding";
import { isRiderWaitingForOnboardingReview } from "@/src/lib/onboarding-routes";
import { openWaitingForReviewSheet } from "@/src/stores/waitingForReviewSheetStore";
import { promptForegroundLocationAgain } from "@/src/lib/riderForegroundLocationGate";
import { useForegroundLocationPermissionStore } from "@/src/stores/foregroundLocationPermissionStore";

async function loadRiderVehicleStatusForDutyGate(): Promise<RiderVehicleStatusResponse | null> {
  const token = useSessionStore.getState().session?.accessToken;
  if (!token) return null;
  try {
    return await getJson<RiderVehicleStatusResponse>(
      `${getRiderAppConfig().apiBaseUrl}/v1/rider/me/vehicle`,
      { headers: { authorization: `Bearer ${token}` } },
    );
  } catch {
    return null;
  }
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | null> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), ms);
    promise
      .then((value) => {
        clearTimeout(timer);
        resolve(value);
      })
      .catch(() => {
        clearTimeout(timer);
        resolve(null);
      });
  });
}

/** Process-wide lock — DutyToggle + OffDuty banner + mismatch sheet share one flight. */
let dutyToggleInFlight = false;

/** Single GPS resolve for Duty ON — reused for precheck + PUT /duty. */
async function resolveDutyToggleLocationFix(): Promise<DutyLocationFixResult> {
  try {
    const servicesOn = await Location.hasServicesEnabledAsync();
    if (!servicesOn) return { ok: false, reason: "services_disabled" };

    const perm = await Location.getForegroundPermissionsAsync();
    if (perm.status !== "granted") return { ok: false, reason: "permission" };

    const fresh = await withTimeout(
      Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }),
      2500
    );
    const loc =
      fresh ?? (await Location.getLastKnownPositionAsync({ maxAge: 60_000 }).catch(() => null));
    if (!loc) return { ok: false, reason: "unavailable" };
    return { ok: true, lat: loc.coords.latitude, lon: loc.coords.longitude };
  } catch {
    return { ok: false, reason: "unavailable" };
  }
}

function isDutyBlockedByServerError(error: unknown): boolean {
  if (!(error instanceof HttpError)) return false;
  if (error.status !== 403) return false;
  const haystack = `${error.message}\n${error.body ?? ""}`;
  return /SUBSCRIPTION_DUTY_STOPPED|WALLET_PENALTY_DUTY_STOPPED|ALL_SERVICES_BLOCKED|subscription penalty|wallet penalty|Clear dues|all requested services are restricted/i.test(
    haystack
  );
}

function parseWorkLocationMismatch(error: unknown): {
  message: string;
  working: Record<string, unknown> | null;
  detected: Record<string, unknown> | null;
} | null {
  const status =
    error instanceof HttpError
      ? error.status
      : error instanceof ApiError
        ? error.status
        : null;
  if (status !== 403) return null;

  const bodyText =
    error instanceof HttpError
      ? error.body ?? ""
      : error instanceof ApiError && error.payload
        ? JSON.stringify(error.payload)
        : "";
  const haystack = `${error instanceof Error ? error.message : ""}\n${bodyText}`;
  if (!/WORK_LOCATION_MISMATCH/i.test(haystack)) return null;

  let working: Record<string, unknown> | null = null;
  let detected: Record<string, unknown> | null = null;
  let message =
    "Your current location is different from your working location. Update your working location to go ON-DUTY here, or cancel to stay offline.";

  const applyPayload = (parsed: {
    message?: string;
    working?: Record<string, unknown>;
    registered?: Record<string, unknown>;
    detected?: Record<string, unknown>;
  }) => {
    if (parsed.message?.trim()) message = parsed.message.trim();
    const w = parsed.working ?? parsed.registered;
    if (w && typeof w === "object") working = w;
    if (parsed.detected && typeof parsed.detected === "object") {
      detected = parsed.detected;
    }
  };

  if (error instanceof ApiError && error.payload && typeof error.payload === "object") {
    applyPayload(error.payload as {
      message?: string;
      working?: Record<string, unknown>;
      registered?: Record<string, unknown>;
      detected?: Record<string, unknown>;
    });
  } else if (error instanceof HttpError && error.body) {
    try {
      applyPayload(JSON.parse(error.body) as {
        message?: string;
        working?: Record<string, unknown>;
        registered?: Record<string, unknown>;
        detected?: Record<string, unknown>;
      });
    } catch {
      /* use defaults */
    }
  }

  return { message, working, detected };
}

function deferDutyQueryRefresh(queryClient: ReturnType<typeof useQueryClient>) {
  // Non-critical — never block Duty ON success on these.
  void queryClient.invalidateQueries({ queryKey: ["rider", "duty"] });
  void queryClient.invalidateQueries({ queryKey: ["rider", "eligibility"] });
  void queryClient.invalidateQueries({ queryKey: RIDER_VEHICLES_QUERY_KEY });
  void queryClient.invalidateQueries({ queryKey: riderVehicleQueryKey });
  setTimeout(() => {
    void queryClient.invalidateQueries({ queryKey: ["rider", "subscription"] });
    void queryClient.invalidateQueries({ queryKey: ["rider", "earnings"] });
  }, 0);
}

export type SetDutyResult = {
  ok: boolean;
  blockedFromGoingOn?: boolean;
  reason?: "vehicle" | "services" | "network" | "blocked" | "busy" | "location";
};

export function useDutyToggle() {
  const isOnDuty = useDutyStore((s) => s.isOnDuty);
  const queryClient = useQueryClient();
  const openVehicleSheet = useVehicleGateStore((s) => s.openSheet);
  const openVerificationModal = useVehicleGateStore((s) => s.openVerificationModal);
  const { data: subscriptionStatus } = useRiderSubscriptionStatus();
  const { data: dutyStatus } = useDutyStatus();
  const { data: earnings } = useEarningsSummary();
  const riderId = useOnboardingStore((s) => s.data.riderId);
  const { data: riderStatus } = useRiderStatus(riderId);
  const [localBusy, setLocalBusy] = useState(false);
  const inFlightRef = useRef(false);

  const restrictions = earnings?.accountRestrictions;
  const blockedServices = mergeRiderBlockedServices(
    restrictions?.blacklistBlockedServices,
    dutyStatus?.blockedServiceTypes,
    restrictions?.globalWalletBlock ? ["food", "parcel", "person_ride"] : []
  );
  const accountFullyBlocked = isRiderFullyDispatchBlocked({
    accountRestricted: restrictions?.accountRestricted ?? dutyStatus?.accountRestricted,
    allServicesBlacklisted:
      restrictions?.allServicesBlacklisted ??
      dutyStatus?.allServicesBlacklisted ??
      restrictions?.globalWalletBlock === true,
    blockedServices,
  });
  const subscriptionDutyBlocked =
    subscriptionStatus?.dues?.dispatchBlocked === true ||
    subscriptionStatus?.dues?.alertBanner?.variant === "restricted";
  const walletPenaltyBlocksDuty = restrictions?.penaltyDutyStopped === true;
  const onboardingReviewBlocksDuty = isRiderWaitingForOnboardingReview(riderStatus);

  const dutyGoOnBlocked =
    accountFullyBlocked || subscriptionDutyBlocked || walletPenaltyBlocksDuty;

  const updateDutyMutation = useMutation({
    mutationFn: async ({
      status,
      serviceTypes,
      lat,
      lon,
      vehicleId,
    }: {
      status: boolean;
      serviceTypes?: string[];
      lat?: number;
      lon?: number;
      vehicleId?: number;
    }) => {
      const deviceId = await getOrCreateDeviceId();
      return riderApi.updateDutyStatus(status, serviceTypes, { deviceId, lat, lon, vehicleId });
    },
    onSuccess: (data) => {
      void useDutyStore.getState().setDutyStatus(data.isOnDuty);
      deferDutyQueryRefresh(queryClient);
    },
  });

  const setDuty = async (next: boolean): Promise<SetDutyResult> => {
    if (next === isOnDuty) return { ok: true };
    if (
      dutyToggleInFlight ||
      inFlightRef.current ||
      updateDutyMutation.isPending ||
      useDutyStore.getState().actionBusy
    ) {
      return { ok: false, reason: "busy" };
    }

    if (next) {
      if (onboardingReviewBlocksDuty) {
        openWaitingForReviewSheet();
        return { ok: false, reason: "blocked" };
      }
      if (dutyGoOnBlocked) {
        deferDutyQueryRefresh(queryClient);
        return { ok: false, blockedFromGoingOn: true, reason: "blocked" };
      }
    }

    dutyToggleInFlight = true;
    inFlightRef.current = true;
    setLocalBusy(true);
    useDutyStore.getState().setActionBusy(true);
    try {
      if (next) {

        const locationPerm = await Location.getForegroundPermissionsAsync();
        if (locationPerm.status !== "granted") {
          // Always hits requestForegroundPermissionsAsync (native dialog) via coordinator.
          const granted = await promptForegroundLocationAgain();
          if (!granted) {
            const phase =
              useForegroundLocationPermissionStore.getState().phase;
            if (phase === "BLOCKED_OR_SETTINGS_REQUIRED") {
              const { openForegroundLocationSettings } = await import(
                "@/src/lib/riderForegroundLocationGate"
              );
              await openForegroundLocationSettings();
            }
            openDutyActionError(
              { kind: "location", locationReason: "permission" },
              () => {
                void setDuty(true);
              }
            );
            return { ok: false, reason: "location" };
          }
        }

        // Network before GPS — never show "Location needed" when offline.
        if (!isRiderNetworkOnline()) {
          openDutyActionError({ kind: "network" }, () => {
            void setDuty(true);
          });
          return { ok: false, reason: "network" };
        }

        // Parallel: GPS once + vehicle status (cache-first, short refresh).
        const cached =
          queryClient.getQueryData<RiderVehicleStatusResponse>(riderVehicleQueryKey) ?? null;
        const [fixResult, fetchedVehicle] = await Promise.all([
          resolveDutyToggleLocationFix(),
          withTimeout(loadRiderVehicleStatusForDutyGate(), 2000),
        ]);
        const vehicleStatus = fetchedVehicle ?? cached;

        if (vehicleStatus) {
          queryClient.setQueryData(riderVehicleQueryKey, vehicleStatus);
        }

        const rcState = vehicleStatus?.rcVerificationState ?? null;
        if (isRcManualReviewPending(rcState) || isRcRejectedOrNeedsReupload(rcState)) {
          // Pending/rejected RC: RiderVehiclePrompt shows the right gate sheet (not vehicle complete).
          openVehicleSheet();
          return { ok: false, reason: "vehicle" };
        }

        if (!vehicleStatus?.isComplete) {
          openVehicleSheet();
          return { ok: false, reason: "vehicle" };
        }

        if (!vehicleStatus.vehicle?.verified || !isRcApprovedForVehicleSheet(rcState)) {
          openVerificationModal();
          return { ok: false, reason: "vehicle" };
        }

        // Multi-vehicle pick only when cache/fleet says >1 — skip blocking list fetch
        // when we already know there is a single verified vehicle.
        const fleetQueries = queryClient.getQueriesData<{
          vehicles?: RiderVehicleView[];
          activeVehicleId?: number | null;
        }>({ queryKey: RIDER_VEHICLES_QUERY_KEY });
        const fleetCache = fleetQueries.find(([, data]) => data?.vehicles)?.[1];
        let fleetVehicles = fleetCache?.vehicles ?? [];
        const cachedVerified = fleetVehicles.filter(
          (v) => v.verified && String(v.status).toLowerCase() !== "retired"
        );
        const needsFleetFetch = cachedVerified.length !== 1;
        let selectedVehicleId: number | null = fleetCache?.activeVehicleId ?? null;

        if (needsFleetFetch) {
          try {
            const fleet = await withTimeout(riderApi.getVehicles(), 2500);
            if (fleet) {
              queryClient.setQueryData(RIDER_VEHICLES_QUERY_KEY, fleet);
              fleetVehicles = fleet.vehicles ?? [];
              const verified = fleetVehicles.filter(
                (v) => v.verified && String(v.status).toLowerCase() !== "retired"
              );
              if (verified.length > 1) {
                const picked = await useDutyVehiclePickStore
                  .getState()
                  .request(verified, fleet.activeVehicleId ?? null);
                if (picked == null) {
                  return { ok: false, reason: "vehicle" };
                }
                selectedVehicleId = picked;
              } else if (verified.length === 1) {
                selectedVehicleId = verified[0]!.id;
              }
            }
          } catch {
            // Non-fatal: fall through with current active vehicle.
          }
        } else if (cachedVerified.length === 1) {
          selectedVehicleId = cachedVerified[0]!.id;
        }

        let serviceTypes = resolveDutyServiceTypesForToggle(queryClient);
        if (!serviceTypes?.length && selectedVehicleId != null) {
          const chosen = fleetVehicles.find((v) => v.id === selectedVehicleId);
          serviceTypes = (["food", "parcel", "person_ride"] as const).filter(
            (s) => chosen?.services?.[s]?.eligible,
          );
        }
        if (!serviceTypes?.length) {
          Alert.alert(
            "Select a service",
            "Turn on at least one service (Food, Parcel, or Person Ride) on Home, then go ON-DUTY.",
          );
          return { ok: false, reason: "vehicle" };
        }

        if (!fixResult.ok) {
          // Fused location can fail when offline — re-check before GPS modal.
          if (!isRiderNetworkOnline()) {
            openDutyActionError({ kind: "network" }, () => {
              void setDuty(true);
            });
            return { ok: false, reason: "network" };
          }
          openDutyActionError(
            { kind: "location", locationReason: fixResult.reason },
            () => {
              void setDuty(true);
            }
          );
          return { ok: false, reason: "location" };
        }

        const fix = { lat: fixResult.lat, lon: fixResult.lon };

        // Precheck BEFORE PUT /duty — mismatch sheet must not appear after optimistic ON.
        try {
          const pre = await riderApi.dutyPrecheck({ lat: fix.lat, lon: fix.lon });
          if (pre.mismatch) {
            openDutyWorkLocationSheet({
              message:
                pre.message ||
                "Your current location is different from your working location. Update your working location to go ON-DUTY here.",
              working: (pre.working ?? pre.registered ?? null) as never,
              registered: (pre.working ?? pre.registered ?? null) as never,
              detected: {
                ...(pre.detected ?? {}),
                lat: fix.lat,
                lon: fix.lon,
              } as never,
            });
            return { ok: false, reason: "location" };
          }
          if (pre.ok === false && pre.hiringAllowed === false) {
            openDutyWorkLocationSheet({
              mode: "not_hiring",
              message:
                pre.message || "Service not available at this location",
              working: (pre.working ?? pre.registered ?? null) as never,
              registered: (pre.working ?? pre.registered ?? null) as never,
              detected: {
                ...(pre.detected ?? {}),
                lat: fix.lat,
                lon: fix.lon,
              } as never,
            });
            return { ok: false, reason: "location" };
          }
        } catch (preErr) {
          // Soft for older backends; still surface true offline / unreachable.
          if (!isRiderNetworkOnline()) {
            openDutyActionError({ kind: "network" }, () => {
              void setDuty(true);
            });
            return { ok: false, reason: "network" };
          }
          const preKind = classifyRiderActionFailure(preErr);
          if (preKind === "network" || preKind === "timeout") {
            openDutyActionError({ kind: "network" }, () => {
              void setDuty(true);
            });
            return { ok: false, reason: "network" };
          }
          // Soft: if precheck fails (older backend), PUT /duty still enforces mismatch.
        }

        try {
          const data = await updateDutyMutation.mutateAsync({
            status: next,
            serviceTypes,
            lat: fix.lat,
            lon: fix.lon,
            vehicleId: selectedVehicleId ?? undefined,
          });
          await useDutyStore.getState().setDutyStatus(data.isOnDuty);
          if (!data.isOnDuty) {
            return { ok: false, blockedFromGoingOn: true, reason: "blocked" };
          }
          void import("@/src/lib/riderPushRefresh").then((m) => m.runRiderPushRefresh());
          return { ok: true };
        } catch (error) {
          if (isVehicleDetailsRequiredError(error)) {
            openVehicleSheet();
            return { ok: false, reason: "vehicle" };
          }
          if (isVehicleNotVerifiedError(error)) {
            openVerificationModal();
            return { ok: false, reason: "vehicle" };
          }
          const locationMismatch = parseWorkLocationMismatch(error);
          if (locationMismatch) {
            openDutyWorkLocationSheet({
              message: locationMismatch.message,
              working: locationMismatch.working as never,
              registered: locationMismatch.working as never,
              detected: {
                ...(locationMismatch.detected ?? {}),
                lat: fix.lat,
                lon: fix.lon,
              } as never,
            });
            return { ok: false, reason: "location" };
          }
          if (isDutyBlockedByServerError(error)) {
            deferDutyQueryRefresh(queryClient);
            return { ok: false, blockedFromGoingOn: true, reason: "blocked" };
          }
          const onboardingPendingHaystack = `${
            error instanceof Error ? error.message : ""
          }\n${error instanceof HttpError ? error.body ?? "" : ""}`;
          if (/ONBOARDING_VERIFICATION_PENDING|waiting for review/i.test(onboardingPendingHaystack)) {
            openWaitingForReviewSheet();
            return { ok: false, reason: "blocked" };
          }
          const failKind = resolveDutyGoOnFailureKind({
            online: isRiderNetworkOnline(),
            apiError: error,
          });
          openDutyActionError({ kind: failKind === "location" ? "server" : failKind }, () => {
            void setDuty(true);
          });
          return { ok: false, reason: "network" };
        }
      }

      if (!isRiderNetworkOnline()) {
        openDutyActionError({ kind: "network" }, () => {
          void setDuty(false);
        });
        return { ok: false, reason: "network" };
      }

      try {
        const data = await updateDutyMutation.mutateAsync({
          status: next,
          serviceTypes: undefined,
        });
        await useDutyStore.getState().setDutyStatus(data.isOnDuty);
        return { ok: true };
      } catch (error) {
        const failKind = resolveDutyGoOnFailureKind({
          online: isRiderNetworkOnline(),
          apiError: error,
        });
        openDutyActionError(
          {
            kind: failKind === "location" ? "server" : failKind,
            title: "Could not go OFF duty",
            message:
              error instanceof Error
                ? error.message
                : "Check your connection and try again.",
          },
          () => {
            void setDuty(false);
          }
        );
        return { ok: false, reason: "network" };
      }
    } finally {
      dutyToggleInFlight = false;
      inFlightRef.current = false;
      setLocalBusy(false);
      useDutyStore.getState().setActionBusy(false);
    }
  };

  const toggle = async () => {
    await setDuty(!isOnDuty);
  };

  const actionBusy = useDutyStore((s) => s.actionBusy);

  return {
    isOnDuty,
    toggle,
    setDuty,
    isPending: actionBusy || updateDutyMutation.isPending || localBusy,
    dutyGoOnBlocked,
    onboardingReviewBlocksDuty,
  };
}
