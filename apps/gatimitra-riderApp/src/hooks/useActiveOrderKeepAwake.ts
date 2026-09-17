import { useEffect, useRef } from "react";
import { AppState, type AppStateStatus } from "react-native";
import { activateKeepAwakeAsync, deactivateKeepAwake } from "expo-keep-awake";
import { useActiveOrders } from "@/src/hooks/useOrders";
import { useDutyStore } from "@/src/stores/dutyStore";
import { useSessionStore } from "@/src/stores/sessionStore";
import { useIncomingDispatchOfferStore } from "@/src/stores/incomingDispatchOfferStore";
import { shouldRiderKeepScreenAwake } from "@/src/lib/riderKeepAwakePolicy";

/**
 * Single authoritative tag for the Rider app. Screens must not activate
 * keep-awake with other tags that could fight this gate.
 */
const KEEP_AWAKE_TAG = "gm-rider-foreground";

/**
 * Keeps the phone screen awake while the Rider app is foregrounded and the
 * Rider is ON-DUTY (waiting for / accepting offers), has an active order, or
 * has an incoming offer modal. Releases on background, OFF-DUTY idle, and logout.
 *
 * Uses expo-keep-awake native API only — no fake touches / timers / brightness hacks.
 */
export function useActiveOrderKeepAwake(): void {
  const session = useSessionStore((s) => s.session);
  const isOnDuty = useDutyStore((s) => s.isOnDuty);
  const { data: activeOrders = [] } = useActiveOrders();
  const lastOfferId = useIncomingDispatchOfferStore((s) => s.lastOfferId);

  const hasSession = Boolean(session?.accessToken && session.role === "rider");
  const hasActiveOrder = activeOrders.length > 0;
  const hasIncomingOffer = Boolean(lastOfferId);

  const computeShouldHold = (appState: AppStateStatus = AppState.currentState) =>
    shouldRiderKeepScreenAwake({
      hasSession,
      isForeground: appState === "active",
      isOnDuty,
      hasActiveOrder,
      hasIncomingOffer,
    });

  const heldRef = useRef(false);
  const computeRef = useRef(computeShouldHold);
  computeRef.current = computeShouldHold;

  async function activate(): Promise<void> {
    try {
      await activateKeepAwakeAsync(KEEP_AWAKE_TAG);
      heldRef.current = true;
    } catch (err) {
      console.warn("[rider-keep-awake] activate failed (non-fatal):", err);
    }
  }

  async function release(): Promise<void> {
    try {
      await deactivateKeepAwake(KEEP_AWAKE_TAG);
    } catch (err) {
      console.warn("[rider-keep-awake] release failed (non-fatal):", err);
    } finally {
      heldRef.current = false;
    }
  }

  useEffect(() => {
    if (computeShouldHold()) {
      if (!heldRef.current) void activate();
      return;
    }
    if (heldRef.current) void release();
  }, [hasSession, isOnDuty, hasActiveOrder, hasIncomingOffer]);

  useEffect(() => {
    const sub = AppState.addEventListener("change", (state: AppStateStatus) => {
      if (computeRef.current(state)) {
        void activate();
      } else if (heldRef.current) {
        void release();
      }
    });
    return () => sub.remove();
  }, []);

  useEffect(() => {
    return () => {
      if (heldRef.current) void release();
    };
  }, []);
}

/** Mount once in root layout — single keep-awake authority for the Rider app. */
export function ActiveOrderKeepAwakeGate(): null {
  useActiveOrderKeepAwake();
  return null;
}
