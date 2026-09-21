/**
 * TEMPORARY tab-flash runtime probe. Remove after the 1.5s blank is proven.
 * Filter Metro: [TABDBG]
 */
import { useCallback, useEffect, useRef } from "react";
import { InteractionManager } from "react-native";
import { useFocusEffect } from "expo-router";
import { getCustomerPrimaryTabNavState } from "@/lib/customerPrimaryTabNav";
import { useMerchantNavTransitionStore } from "@/store/merchantNavTransitionStore";

export const TAB_NAV_DEBUG = true;

export function tabDbg(event: string, payload?: Record<string, unknown>): void {
  if (!TAB_NAV_DEBUG) return;
  const now = Date.now();
  const iso = new Date(now).toISOString().slice(11, 23);
  const nav = getCustomerPrimaryTabNavState();
  // eslint-disable-next-line no-console
  console.log(`[TABDBG][${iso}][${event}]`, {
    t: now,
    requested: nav.requestedTab,
    committed: nav.committedTab,
    inflight: nav.inflightEpoch,
    shutter: useMerchantNavTransitionStore.getState().active,
    ...payload,
  });
}

/** Temporary Food bounce-fix probe. Filter Metro: [FOODFIX] */
export function foodFixDbg(
  event: string,
  payload: {
    source: string;
    target?: string;
    method?: string;
    pathname?: string;
    from?: string;
    reason?: string;
    [key: string]: unknown;
  }
): void {
  if (!TAB_NAV_DEBUG) return;
  const now = Date.now();
  const iso = new Date(now).toISOString().slice(11, 23);
  const nav = getCustomerPrimaryTabNavState();
  // eslint-disable-next-line no-console
  console.log(`[FOODFIX] ${iso} ${event}`, {
    t: now,
    requested: nav.requestedTab,
    committed: nav.committedTab,
    inflight: nav.inflightEpoch,
    ...payload,
  });
}

/** Dedicated Food bounce probe. Filter Metro: [FOODNAV] */
export function foodNavDbg(
  action: string,
  payload: {
    source: string;
    from?: string;
    to?: string;
    reason?: string;
    method?: string;
    [key: string]: unknown;
  }
): void {
  if (!TAB_NAV_DEBUG) return;
  const now = Date.now();
  const iso = new Date(now).toISOString().slice(11, 23);
  const nav = getCustomerPrimaryTabNavState();
  // eslint-disable-next-line no-console
  console.log(`[FOODNAV] ${iso}`, {
    action,
    t: now,
    requested: nav.requestedTab,
    committed: nav.committedTab,
    inflight: nav.inflightEpoch,
    ...payload,
  });
}

/** Mount / unmount / focus / blur + InteractionManager drain. Not per-render. */
export function useTabScreenDebug(name: string): void {
  useEffect(() => {
    tabDbg("SCREEN_MOUNT", { name });
    return () => tabDbg("SCREEN_UNMOUNT", { name });
  }, [name]);

  useFocusEffect(
    useCallback(() => {
      tabDbg("SCREEN_FOCUS", { name });
      requestAnimationFrame(() => tabDbg("SCREEN_FOCUS_RAF", { name }));
      const task = InteractionManager.runAfterInteractions(() => {
        tabDbg("SCREEN_FOCUS_AFTER_IM", { name });
      });
      return () => {
        task.cancel();
        tabDbg("SCREEN_BLUR", { name });
      };
    }, [name])
  );
}
