import { useRiderDispatchRecovery } from "@/src/hooks/useRiderDispatchRecovery";

/** Session-scoped dispatch lifecycle (WS + HTTP recovery). Not a Home keepalive. */
export function RiderDispatchKeepAlive() {
  useRiderDispatchRecovery();
  return null;
}
