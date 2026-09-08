import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Alert } from "react-native";
import * as Location from "expo-location";
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

/**
 * When the rider has 2 verified vehicles, force an explicit pick before going ON
 * (max 2 RCs). Returns selected id, or null if cancelled.
 */
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

/**
 * Best-effort fix for the go-ON request only — never blocks or prompts for
 * permission (that's handled elsewhere in onboarding). Without this, going ON
 * duty only logged lat/lon into duty_logs (audit trail) and left
 * rider_current_locations (what dispatch/serviceability actually reads) to the
 * independent background ping loop, which could lag long enough that a rider
 * who just went online showed as unavailable everywhere else.
 */
async function resolveDutyToggleLocationFix(): Promise<{ lat: number; lon: number } | null> {
  try {
    const perm = await Location.getForegroundPermissionsAsync();
    if (perm.status !== "granted") return null;
    const fresh = await withTimeout(
      Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }),
      3000
    );
    const loc = fresh ?? (await Location.getLastKnownPositionAsync({ maxAge: 30_000 }).catch(() => null));
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

export type SetDutyResult = {
  ok: boolean;
  blockedFromGoingOn?: boolean;
  reason?: "vehicle" | "services" | "network" | "blocked" | "busy";
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
  // Penalty blocks duty ONLY when the server says so — and the server now decides
  // that against the Super-Admin wallet threshold (penaltyFullyStopsDuty), not on
  // "balance is negative". A sub-threshold penalty (or a brief order-time debit that
  // dips the balance negative) must NOT block go-ON or flip the toggle off; it only
  // shows a "pay it down" banner. Re-deriving a hard stop from walletBalance < 0 here
  // was the bug that turned the toggle off on any penalty / on order assignment.
  const walletPenaltyBlocksDuty = restrictions?.penaltyDutyStopped === true;

  /** Client-side hard lock — never call PUT /duty ON while true. */
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
      void queryClient.invalidateQueries({ queryKey: ["rider", "subscription"] });
      void queryClient.invalidateQueries({ queryKey: ["rider", "duty"] });
      void queryClient.invalidateQueries({ queryKey: ["rider", "earnings"] });
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
          void queryClient.invalidateQueries({ queryKey: ["rider", "subscription"] });
          void queryClient.invalidateQueries({ queryKey: ["rider", "duty"] });
          void queryClient.invalidateQueries({ queryKey: ["rider", "earnings"] });
          return { ok: false, blockedFromGoingOn: true, reason: "blocked" };
        }

        // Prefer cache so the first tap is instant; refresh in parallel with a short timeout.
        const cached =
          queryClient.getQueryData<RiderVehicleStatusResponse>(riderVehicleQueryKey) ?? null;
        const fetched = await withTimeout(loadRiderVehicleStatusForDutyGate(), 2500);
        const vehicleStatus = fetched ?? cached;

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

        // Phase C: multi-vehicle — require explicit selection before going ON.
        try {
          const fleet = await riderApi.getVehicles();
          const verified = (fleet.vehicles ?? []).filter(
            (v) => v.verified && String(v.status).toLowerCase() !== "retired"
          );
          if (verified.length > 1) {
            const picked = await promptSelectVehicleForDuty(verified, fleet.activeVehicleId);
            if (picked == null) {
              return { ok: false, reason: "vehicle" };
            }
            if (picked !== fleet.activeVehicleId) {
              await riderApi.setActiveVehicle(picked);
              void queryClient.invalidateQueries({ queryKey: ["rider", "vehicles"] });
              void queryClient.invalidateQueries({ queryKey: riderVehicleQueryKey });
            }
          } else if (verified.length === 1 && verified[0]!.id !== fleet.activeVehicleId) {
            await riderApi.setActiveVehicle(verified[0]!.id);
            void queryClient.invalidateQueries({ queryKey: ["rider", "vehicles"] });
            void queryClient.invalidateQueries({ queryKey: riderVehicleQueryKey });
          }
        } catch {
          // Non-fatal: fall through with current active vehicle if list fails.
        }

        let serviceTypes = resolveDutyServiceTypesForToggle(queryClient);
        // Cache may not be warm on first tap — fall back so Go-ON still hits the API.
        if (!serviceTypes?.length) {
          const stored = vehicleStatus.vehicle?.serviceTypes;
          if (Array.isArray(stored) && stored.length > 0) {
            serviceTypes = stored.map(String);
          } else {
            serviceTypes = ["food", "parcel", "person_ride"];
          }
        }

        try {
          const fix = await resolveDutyToggleLocationFix();
          const data = await updateDutyMutation.mutateAsync({
            status: next,
            serviceTypes,
            lat: fix?.lat,
            lon: fix?.lon,
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
          if (isDutyBlockedByServerError(error)) {
            void queryClient.invalidateQueries({ queryKey: ["rider", "subscription"] });
            void queryClient.invalidateQueries({ queryKey: ["rider", "duty"] });
            void queryClient.invalidateQueries({ queryKey: ["rider", "earnings"] });
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
