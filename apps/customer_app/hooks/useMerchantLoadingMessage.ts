import { useState } from "react";
import {
  MERCHANT_MENU_LOADING_MESSAGES,
  useMerchantLoadingMessageStore,
} from "@/lib/merchantMenuLoadingMessages";

function resolveLoadingMessage(
  merchantId: string | undefined,
  startIndex?: number
): string {
  if (startIndex != null) {
    return MERCHANT_MENU_LOADING_MESSAGES[startIndex] ?? MERCHANT_MENU_LOADING_MESSAGES[0];
  }
  if (!merchantId?.trim()) {
    return MERCHANT_MENU_LOADING_MESSAGES[0];
  }
  const idx = useMerchantLoadingMessageStore.getState().pickStartIndex(merchantId);
  return MERCHANT_MENU_LOADING_MESSAGES[idx] ?? MERCHANT_MENU_LOADING_MESSAGES[0];
}

/**
 * One loading sentence per skeleton session — no in-session rotation.
 * Next store open picks the following sentence from the list.
 */
export function useMerchantLoadingMessage(
  merchantId: string | undefined,
  startIndex?: number
): string {
  const [message] = useState(() => resolveLoadingMessage(merchantId, startIndex));
  return message;
}
