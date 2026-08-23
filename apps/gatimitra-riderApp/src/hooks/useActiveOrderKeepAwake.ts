import { useEffect, useRef } from "react";
import { AppState, type AppStateStatus } from "react-native";
import { activateKeepAwakeAsync, deactivateKeepAwake } from "expo-keep-awake";
import { useActiveOrders } from "@/src/hooks/useOrders";
import { isActiveRiderOrder } from "@/src/lib/active-order-display";

/**
 * Dedicated tag so our lock is independent of any component-scoped keep-awake and can
 * only ever be released by us (never toggles the whole screen permanently).
 */
const KEEP_AWAKE_TAG = "gm-rider-active-order";

/**
 * Order-lifecycle keep-awake.
 *
 * Prevents the device screen from AUTOMATICALLY timing out while the rider has at least
 * one backend-authoritative active order (Food / Parcel / Person Ride — any status from
 * assignment up to the terminal state), and restores normal screen-sleep behaviour the
 * moment no active order remains.
 *
 * Design:
 * - Source of truth is `useActiveOrders()` (the same React Query cache every active-order
 *   surface uses; backend already filters out terminal statuses). We additionally run the
 *   canonical `isActiveRiderOrder` predicate so our definition of "active" can never drift
 *   from the rest of the app. Multi-order is handled naturally by array length.
 * - Mounted ONCE at the app root, so it is screen-independent: navigating between Home /
 *   Map / Order Details / Pickup / Delivery / Profile never drops the lock.
 * - Idempotent: we track whether WE hold the lock and only call the native API on an
 *   actual transition (GPS/realtime re-renders don't churn wake locks).
 * - Battery-conscious: no active order → lock released → normal OS sleep. Merely being
 *   online, or seeing hot zones, never activates it (those don't produce active orders).
 * - Error-safe: any keep-awake failure is swallowed (some builds can't toggle it) and
 *   never breaks the order flow.
 * - Not a background mechanism: this is a screen flag only; background location / realtime
 *   / push keep using their own existing systems. It also never fights the OS lock button.
 */
export function useActiveOrderKeepAwake(): void {
  const { data } = useActiveOrders();
  const activeCount = (data ?? []).filter(isActiveRiderOrder).length;
  const shouldKeepAwake = activeCount > 0;

  // Whether we currently hold the native lock — keeps transitions idempotent.
  const heldRef = useRef(false);
  // Latest desired state, readable from the AppState listener without re-subscribing.
  const shouldKeepAwakeRef = useRef(shouldKeepAwake);
  shouldKeepAwakeRef.current = shouldKeepAwake;

  async function activate(): Promise<void> {
    try {
      await activateKeepAwakeAsync(KEEP_AWAKE_TAG);
      heldRef.current = true;
    } catch (err) {
      console.warn("[active-order-keep-awake] activate failed (non-fatal):", err);
    }
  }

  async function release(): Promise<void> {
    try {
      await deactivateKeepAwake(KEEP_AWAKE_TAG);
    } catch (err) {
      console.warn("[active-order-keep-awake] release failed (non-fatal):", err);
    } finally {
      heldRef.current = false;
    }
  }

  // React to changes in active-order state.
  useEffect(() => {
    if (shouldKeepAwake && !heldRef.current) {
      void activate();
    } else if (!shouldKeepAwake && heldRef.current) {
      void release();
    }
  }, [shouldKeepAwake]);

  // Re-assert on foreground return (the OS can drop the flag while backgrounded).
  // activateKeepAwakeAsync with the same tag is a no-op if already held.
  useEffect(() => {
    const sub = AppState.addEventListener("change", (state: AppStateStatus) => {
      if (state === "active" && shouldKeepAwakeRef.current) {
        void activate();
      }
    });
    return () => sub.remove();
  }, []);

  // Safety net: release on teardown so we never leak a lock.
  useEffect(() => {
    return () => {
      if (heldRef.current) void release();
    };
  }, []);
}

/**
 * Null-rendering host that owns the app-wide active-order keep-awake lifecycle.
 * Mount exactly once, inside the app providers (next to the other active-order hosts).
 */
export function ActiveOrderKeepAwakeGate(): null {
  useActiveOrderKeepAwake();
  return null;
}
