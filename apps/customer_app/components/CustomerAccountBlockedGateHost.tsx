/**
 * Admin account service block gate — shows bottom sheet on inner food / ride / parcel routes.
 */

import { useCallback, useEffect, useMemo, useRef } from "react";
import { usePathname, useRouter } from "expo-router";
import { useQueryClient } from "@tanstack/react-query";
import { useCustomerServiceBlocks, CUSTOMER_SERVICE_BLOCKS_QUERY_KEY } from "@/hooks/useCustomerServiceBlocks";
import {
  CUSTOMER_HOME_SERVICE_META,
  gateServiceToHomeId,
} from "@/lib/customerHomeServiceMeta";
import { useCustomerServiceBlockSheetStore } from "@/store/customerServiceBlockSheetStore";

type GateService = "food" | "ride" | "parcel" | "ecom" | "vouchers" | "near-me";

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

function resolveBlockedService(
  pathname: string,
  blocks: {
    food?: string;
    ride?: string;
    parcels?: string;
    ecom?: string;
    vouchers?: string;
    "near-me"?: string;
  }
): { service: GateService; reason: string } | null {
  if (isRideInnerRoute(pathname) && blocks.ride) {
    return { service: "ride", reason: blocks.ride };
  }
  if (isFoodInnerRoute(pathname) && blocks.food) {
    return { service: "food", reason: blocks.food };
  }
  if (isParcelInnerRoute(pathname) && blocks.parcels) {
    return { service: "parcel", reason: blocks.parcels };
  }
  if (pathname.startsWith("/home/shop") && blocks.ecom) {
    return { service: "ecom", reason: blocks.ecom };
  }
  if (pathname.startsWith("/home/service/vouchers") && blocks.vouchers) {
    return { service: "vouchers", reason: blocks.vouchers };
  }
  if (pathname.startsWith("/home/service/near-me") && blocks["near-me"]) {
    return { service: "near-me", reason: blocks["near-me"] };
  }
  return null;
}

function serviceLabelFor(gate: GateService): string {
  const homeId = gateServiceToHomeId(gate);
  return CUSTOMER_HOME_SERVICE_META[homeId].label;
}

function serviceAssetKeyFor(gate: GateService): string {
  const homeId = gateServiceToHomeId(gate);
  return CUSTOMER_HOME_SERVICE_META[homeId].assetKey;
}

export function CustomerAccountBlockedGateHost() {
  const pathname = usePathname();
  const router = useRouter();
  const queryClient = useQueryClient();
  const openSheet = useCustomerServiceBlockSheetStore((s) => s.open);
  const sheetVisible = useCustomerServiceBlockSheetStore((s) => s.visible);
  const { accountBlocks, isSuccess } = useCustomerServiceBlocks();
  const ackedByService = useRef<Partial<Record<GateService, boolean>>>({});
  const prevSheetVisible = useRef(false);

  const activeBlock = useMemo(() => {
    if (!isSuccess) return null;
    return resolveBlockedService(pathname, accountBlocks);
  }, [isSuccess, pathname, accountBlocks]);

  useEffect(() => {
    if (!isSuccess) return;
    if (!accountBlocks.food) delete ackedByService.current.food;
    if (!accountBlocks.ride) delete ackedByService.current.ride;
    if (!accountBlocks.parcels) delete ackedByService.current.parcel;
    if (!accountBlocks.ecom) delete ackedByService.current.ecom;
    if (!accountBlocks.vouchers) delete ackedByService.current.vouchers;
    if (!accountBlocks["near-me"]) delete ackedByService.current["near-me"];
  }, [isSuccess, accountBlocks]);

  useEffect(() => {
    if (!activeBlock) return;
    if (ackedByService.current[activeBlock.service]) return;

    openSheet({
      serviceLabel: serviceLabelFor(activeBlock.service),
      reason: activeBlock.reason,
      serviceAssetKey: serviceAssetKeyFor(activeBlock.service),
    });

    if (activeBlock.service === "food" && isFoodInnerRoute(pathname)) {
      router.replace("/(tabs)" as never);
    }
  }, [activeBlock, pathname, openSheet, router]);

  const handleRefresh = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: CUSTOMER_SERVICE_BLOCKS_QUERY_KEY });
  }, [queryClient]);

  useEffect(() => {
    if (prevSheetVisible.current && !sheetVisible && activeBlock) {
      ackedByService.current[activeBlock.service] = true;
      handleRefresh();
    }
    prevSheetVisible.current = sheetVisible;
  }, [sheetVisible, activeBlock, handleRefresh]);

  return null;
}
