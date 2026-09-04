import { useEffect, useRef } from "react";
import { AppState, type AppStateStatus } from "react-native";
import { activateKeepAwakeAsync, deactivateKeepAwake } from "expo-keep-awake";
import { useActiveOrders } from "@/src/hooks/useOrders";

/**
 * Dedicated tag so our lock is independent of any component-scoped keep-awake.
 */
const KEEP_AWAKE_TAG = "gm-rider-foreground";

/**
 * Keeps the screen on only while an active order is in progress and the app
 * is foregrounded. Idle Home must be allowed to dim — a permanent wake lock
 * is a major thermal source. Power-button lock is unchanged.
 */
export function useActiveOrderKeepAwake(): void {
  const { data: activeOrders = [] } = useActiveOrders();
  const shouldKeepAwake = activeOrders.length > 0;

  const heldRef = useRef(false);
  const shouldKeepAwakeRef = useRef(shouldKeepAwake);
  shouldKeepAwakeRef.current = shouldKeepAwake;

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
    if (shouldKeepAwake && AppState.currentState === "active") {
      if (!heldRef.current) void activate();
      return;
    }
    if (heldRef.current) void release();
  }, [shouldKeepAwake]);

  useEffect(() => {
    const sub = AppState.addEventListener("change", (state: AppStateStatus) => {
      if (state === "active" && shouldKeepAwakeRef.current) {
        void activate();
      } else if (state !== "active" && heldRef.current) {
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

export function ActiveOrderKeepAwakeGate(): null {
  useActiveOrderKeepAwake();
  return null;
}
