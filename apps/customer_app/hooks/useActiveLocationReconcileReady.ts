/**
 * React hook: re-renders when cold-start / resume reconcile gate flips.
 */

import { useSyncExternalStore } from "react";
import {
  isActiveLocationReconcileReady,
  subscribeActiveLocationReconcileGate,
} from "@/lib/activeLocationReconcileGate";

export function useActiveLocationReconcileReady(): boolean {
  return useSyncExternalStore(
    subscribeActiveLocationReconcileGate,
    isActiveLocationReconcileReady,
    () => false
  );
}
