import { useEffect, useRef, useState } from "react";
import {
  MERCHANT_MENU_LOADING_MESSAGES,
  useMerchantLoadingMessageStore,
} from "@/lib/merchantMenuLoadingMessages";

const MESSAGE_COUNT = MERCHANT_MENU_LOADING_MESSAGES.length;

function resolveStartIndex(
  merchantId: string | undefined,
  startIndex?: number
): number {
  if (startIndex != null && startIndex >= 0) {
    return startIndex % MESSAGE_COUNT;
  }
  // Always pick a fresh random sentence for this store entry.
  return useMerchantLoadingMessageStore.getState().pickStartIndex(merchantId) % MESSAGE_COUNT;
}

/**
 * Loading sentence for the merchant skeleton.
 * One sentence per visit — different each time the user enters a store.
 * Does not rotate mid-load (avoids the same first line flashing every entry).
 */
export function useMerchantLoadingMessage(
  merchantId: string | undefined,
  startIndex?: number,
  _intervalMs = 2800
): string {
  const visitKey = `${merchantId ?? ""}:${startIndex ?? "auto"}`;
  const [index, setIndex] = useState(() => resolveStartIndex(merchantId, startIndex));
  const appliedVisitKeyRef = useRef(visitKey);

  // Sync when a new store visit / shutter index arrives — never double-advance on mount.
  useEffect(() => {
    if (appliedVisitKeyRef.current === visitKey) return;
    appliedVisitKeyRef.current = visitKey;
    setIndex(resolveStartIndex(merchantId, startIndex));
  }, [visitKey, merchantId, startIndex]);

  return (
    MERCHANT_MENU_LOADING_MESSAGES[index] ??
    MERCHANT_MENU_LOADING_MESSAGES[0] ??
    "Preparing your perfect menu."
  );
}
