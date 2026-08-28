/**
 * Emergency service block gate (mounted once, app-wide).
 *
 * Uses /v1/prevent-services/check against the selected delivery pin for
 * authoritative, realtime-friendly blocking. Main home tiles stay active via
 * coverage*; blocking surfaces on inner food / ride / parcel screens.
 *
 * Got It keeps the user on-screen (so they can change location). ACK is
 * per-service + rule and resets when they leave that zone.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname } from "expo-router";
import { useQueryClient } from "@tanstack/react-query";
import { usePreventServicesAtPin } from "@/hooks/usePreventServicesAtPin";
import { ServiceBlockedBottomSheet } from "@/components/ServiceBlockedBottomSheet";

type GateService = "food" | "ride" | "parcel";

function isFoodInnerRoute(pathname: string): boolean {
  return (
    pathname === "/home" ||
    pathname.startsWith("/home/grocery") ||
    pathname.startsWith("/home/merchant") ||
    pathname.startsWith("/home/category") ||
    pathname.startsWith("/home/meals-under-price") ||
    pathname.startsWith("/cart") ||
    pathname.startsWith("/checkout") ||
    pathname.startsWith("/search") ||
    pathname.startsWith("/profile/collections")
  );
}

function isRideInnerRoute(pathname: string): boolean {
  if (!pathname.startsWith("/home/service/ride")) return false;
  return !pathname.startsWith("/home/service/ride-searching");
}

function isParcelInnerRoute(pathname: string): boolean {
  return (
    pathname.startsWith("/home/service/parcel") ||
    pathname.startsWith("/home/service/parcels") ||
    pathname.includes("/parcel")
  );
}

function resolveGateService(
  pathname: string,
  foodLocked: boolean,
  rideLocked: boolean,
  parcelLocked: boolean
): GateService | null {
  if (isRideInnerRoute(pathname) && rideLocked) return "ride";
  if (isFoodInnerRoute(pathname) && foodLocked) return "food";
  if (isParcelInnerRoute(pathname) && parcelLocked) return "parcel";
  return null;
}

function serviceLabelFor(gate: GateService): string {
  if (gate === "ride") return "Book a Ride";
  if (gate === "parcel") return "Courier / Parcel";
  return "Order Food";
}

export function ServiceBlockedGateHost() {
  const pathname = usePathname();
  const queryClient = useQueryClient();
  const {
    foodLocked,
    rideLocked,
    parcelLocked,
    preventReason,
    preventLocationName,
    preventRuleId,
    preventStartsAt,
    preventEndsAt,
    isSuccess,
  } = usePreventServicesAtPin();

  const [visible, setVisible] = useState(false);
  const ackedRuleByService = useRef<Partial<Record<GateService, string>>>({});

  const blockedService = useMemo(() => {
    if (!isSuccess) return null;
    return resolveGateService(pathname, foodLocked, rideLocked, parcelLocked);
  }, [isSuccess, pathname, foodLocked, rideLocked, parcelLocked]);

  useEffect(() => {
    if (!isSuccess) return;
    if (!foodLocked) delete ackedRuleByService.current.food;
    if (!rideLocked) delete ackedRuleByService.current.ride;
    if (!parcelLocked) delete ackedRuleByService.current.parcel;
  }, [isSuccess, foodLocked, rideLocked, parcelLocked]);

  useEffect(() => {
    if (!blockedService) {
      setVisible(false);
      return;
    }
    const zoneKey = preventRuleId ?? preventLocationName ?? "unknown-zone";
    if (ackedRuleByService.current[blockedService] === zoneKey) {
      setVisible(false);
      return;
    }
    setVisible(true);
  }, [blockedService, preventRuleId, preventLocationName, pathname]);

  const handleGotIt = useCallback(() => {
    if (blockedService) {
      const zoneKey = preventRuleId ?? preventLocationName ?? "unknown-zone";
      ackedRuleByService.current[blockedService] = zoneKey;
    }
    setVisible(false);
  }, [blockedService, preventRuleId, preventLocationName]);

  const handleExpired = useCallback(() => {
    setVisible(false);
    if (blockedService) delete ackedRuleByService.current[blockedService];
    void queryClient.invalidateQueries({
      queryKey: ["prevent", "check"],
      refetchType: "all",
    });
    void queryClient.invalidateQueries({
      queryKey: ["geo", "services"],
      refetchType: "all",
    });
  }, [blockedService, queryClient]);

  if (!visible || !blockedService) return null;

  return (
    <ServiceBlockedBottomSheet
      visible={visible}
      reason={preventReason}
      locationName={preventLocationName}
      serviceLabel={serviceLabelFor(blockedService)}
      startsAt={preventStartsAt}
      endsAt={preventEndsAt}
      onGotIt={handleGotIt}
      onExpired={handleExpired}
    />
  );
}
