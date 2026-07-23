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
  // Always advance so every store entry gets a fresh sentence.
  return useMerchantLoadingMessageStore.getState().pickStartIndex(merchantId) % MESSAGE_COUNT;
}

/**
 * Loading sentence for the merchant skeleton.
 * - Starts from the visit's picked index (or advances the global cursor once).
 * - Rotates while mounted so users see variety on slow loads.
 */
export function useMerchantLoadingMessage(
  merchantId: string | undefined,
  startIndex?: number,
  intervalMs = 2800
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

  useEffect(() => {
    if (MESSAGE_COUNT <= 1) return;
    const id = setInterval(() => {
      setIndex((prev) => (prev + 1) % MESSAGE_COUNT);
    }, Math.max(1400, intervalMs));
    return () => clearInterval(id);
  }, [intervalMs, visitKey]);

  return (
    MERCHANT_MENU_LOADING_MESSAGES[index] ??
    MERCHANT_MENU_LOADING_MESSAGES[0] ??
    "Preparing your perfect menu."
  );
}
