import { useRiderDispatchRecovery } from "@/src/hooks/useRiderDispatchRecovery";

/** Foreground/network/duty recovery for dispatch offer delivery. */
export function RiderDispatchKeepAlive() {
  useRiderDispatchRecovery();
  return null;
}
