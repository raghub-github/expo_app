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

function vehicleDutyLabel(v: RiderVehicleView): string {
  const cls =
    v.vehicleClass === "2_wheeler"
      ? "2W"
      : v.vehicleClass === "3_wheeler"
        ? "3W"
        : v.vehicleClass === "4_wheeler"
          ? "4W"
          : "Vehicle";
  const fuel = v.fuelKind === "ev" ? "EV" : v.fuelKind === "petrol" ? "Petrol" : v.fuelKind || "";
  const own = v.commercial ? "Commercial" : "Non-commercial";
  return `${cls}${fuel ? ` · ${fuel}` : ""} · ${own} · ${v.registrationMasked || v.registrationNumber}`;
}

function promptSelectVehicleForDuty(
  vehicles: RiderVehicleView[],
  activeVehicleId: number | null
): Promise<number | null> {
  return new Promise((resolve) => {
    Alert.alert(
      "Select vehicle for today's work",
      "You're going online with the vehicle you pick. Services available depend on that vehicle and your current location.",
      [
        ...vehicles.slice(0, 2).map((v) => ({
          text: `${v.isActiveVehicle || v.id === activeVehicleId ? "✓ " : ""}${vehicleDutyLabel(v)}`,
          onPress: () => resolve(v.id),
        })),
        {
          text: "Cancel",
          style: "cancel" as const,
          onPress: () => resolve(null),
        },
      ]
    );
  });
}

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
  return Promise.race([
    promise,
    new Promise<null>((resolve) => setTimeout(() => resolve(null), ms)),
  ]);
}

/** Single GPS resolve for Duty ON — reused for precheck + PUT /duty. */
async function resolveDutyToggleLocationFix(): Promise<{ lat: number; lon: number } | null> {
  try {
    const perm = await Location.getForegroundPermissionsAsync();
    if (perm.status !== "granted") return null;
    const fresh = await withTimeout(
      Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }),
      2500
    );
    const loc = fresh ?? (await Location.getLastKnownPositionAsync({ maxAge: 60_000 }).catch(() => null));
    if (!loc) return null;
    return { lat: loc.coords.latitude, lon: loc.coords.longitude };
  } catch {
    return null;
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

  const dutyGoOnBlocked =
    accountFullyBlocked || subscriptionDutyBlocked || walletPenaltyBlocksDuty;

  const updateDutyMutation = useMutation({
    mutationFn: async ({
      status,
      serviceTypes,
      lat,
      lon,
    }: {
      status: boolean;
      serviceTypes?: string[];
      lat?: number;
      lon?: number;
    }) => {
      const deviceId = await getOrCreateDeviceId();
      return riderApi.updateDutyStatus(status, serviceTypes, { deviceId, lat, lon });
    },
    onSuccess: (data) => {
      void useDutyStore.getState().setDutyStatus(data.isOnDuty);
      deferDutyQueryRefresh(queryClient);
    },
  });

  const setDuty = async (next: boolean): Promise<SetDutyResult> => {
    if (next === isOnDuty) return { ok: true };
    if (inFlightRef.current || updateDutyMutation.isPending) {
      return { ok: false, reason: "busy" };
    }

    inFlightRef.current = true;
    setLocalBusy(true);
    try {
      if (next) {
        if (dutyGoOnBlocked) {
          deferDutyQueryRefresh(queryClient);
          return { ok: false, blockedFromGoingOn: true, reason: "blocked" };
        }

        // Parallel: GPS once + vehicle status (cache-first, short refresh).
        const cached =
          queryClient.getQueryData<RiderVehicleStatusResponse>(riderVehicleQueryKey) ?? null;
        const [fix, fetchedVehicle] = await Promise.all([
          resolveDutyToggleLocationFix(),
          withTimeout(loadRiderVehicleStatusForDutyGate(), 2000),
        ]);
        const vehicleStatus = fetchedVehicle ?? cached;

        if (vehicleStatus) {
          queryClient.setQueryData(riderVehicleQueryKey, vehicleStatus);
        }

        if (!vehicleStatus?.isComplete) {
          openVehicleSheet();
          return { ok: false, reason: "vehicle" };
        }

        if (!vehicleStatus.vehicle?.verified) {
          openVerificationModal();
          return { ok: false, reason: "vehicle" };
        }

        // Multi-vehicle pick only when cache/fleet says >1 — skip blocking list fetch
        // when we already know there is a single verified vehicle.
        const fleetCache = queryClient.getQueryData<{
          vehicles?: RiderVehicleView[];
          activeVehicleId?: number | null;
        }>(RIDER_VEHICLES_QUERY_KEY);
        const cachedVerified = (fleetCache?.vehicles ?? []).filter(
          (v) => v.verified && String(v.status).toLowerCase() !== "retired"
        );
        const needsFleetFetch = cachedVerified.length !== 1;

        if (needsFleetFetch) {
          try {
            const fleet = await withTimeout(riderApi.getVehicles(), 2500);
            if (fleet) {
              queryClient.setQueryData(RIDER_VEHICLES_QUERY_KEY, fleet);
              const verified = (fleet.vehicles ?? []).filter(
                (v) => v.verified && String(v.status).toLowerCase() !== "retired"
              );
              if (verified.length > 1) {
                const picked = await promptSelectVehicleForDuty(
                  verified,
                  fleet.activeVehicleId ?? null
                );
                if (picked == null) {
                  return { ok: false, reason: "vehicle" };
                }
                if (picked !== fleet.activeVehicleId) {
                  await riderApi.setActiveVehicle(picked);
                  void queryClient.invalidateQueries({ queryKey: RIDER_VEHICLES_QUERY_KEY });
                  void queryClient.invalidateQueries({ queryKey: riderVehicleQueryKey });
                }
              } else if (
                verified.length === 1 &&
                verified[0]!.id !== fleet.activeVehicleId
              ) {
                await riderApi.setActiveVehicle(verified[0]!.id);
                void queryClient.invalidateQueries({ queryKey: RIDER_VEHICLES_QUERY_KEY });
                void queryClient.invalidateQueries({ queryKey: riderVehicleQueryKey });
              }
            }
          } catch {
            // Non-fatal: fall through with current active vehicle.
          }
        }

        let serviceTypes = resolveDutyServiceTypesForToggle(queryClient);
        if (!serviceTypes?.length) {
          const stored = vehicleStatus.vehicle?.serviceTypes;
          if (Array.isArray(stored) && stored.length > 0) {
            serviceTypes = stored.map(String);
          } else {
            serviceTypes = ["food", "parcel", "person_ride"];
          }
        }

        if (!fix?.lat || !fix?.lon) {
          Alert.alert(
            "Location needed",
            "Turn on GPS and try again. We need your current location before you can go ON-DUTY."
          );
          return { ok: false, reason: "location" };
        }

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
        } catch {
          // Soft: if precheck fails (older backend), PUT /duty still enforces mismatch.
        }

        try {
          const data = await updateDutyMutation.mutateAsync({
            status: next,
            serviceTypes,
            lat: fix.lat,
            lon: fix.lon,
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
          Alert.alert(
            "Could not go ON duty",
            error instanceof Error ? error.message : "Check your connection and try again."
          );
          return { ok: false, reason: "network" };
        }
      }

      try {
        const data = await updateDutyMutation.mutateAsync({
          status: next,
          serviceTypes: undefined,
        });
        await useDutyStore.getState().setDutyStatus(data.isOnDuty);
        return { ok: true };
      } catch (error) {
        Alert.alert(
          "Could not go OFF duty",
          error instanceof Error ? error.message : "Check your connection and try again."
        );
        return { ok: false, reason: "network" };
      }
    } finally {
      inFlightRef.current = false;
      setLocalBusy(false);
    }
  };

  const toggle = async () => {
    await setDuty(!isOnDuty);
  };

  return {
    isOnDuty,
    toggle,
    setDuty,
    isPending: updateDutyMutation.isPending || localBusy,
    dutyGoOnBlocked,
  };
}
