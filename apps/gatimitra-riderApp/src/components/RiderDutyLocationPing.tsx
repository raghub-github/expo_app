import { useRiderDutyLocationPing } from "@/src/hooks/useRiderDutyLocationPing";

/** Background GPS pings while on duty (dispatch eligibility). */
export function RiderDutyLocationPing() {
  useRiderDutyLocationPing();
  return null;
}
