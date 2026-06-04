/** Rider dispatch-offer reject reason codes (incoming order modal). */

export const RIDER_ORDER_REJECT_REASON_CODES = [
  "PERSONAL_EMERGENCY",
  "GOING_OFF_DUTY",
  "VEHICLE_TECHNICAL",
  "STORE_ISSUE",
  "CUSTOMER_REQUESTED_CANCEL",
  "DELIVERY_LOCATION_ISSUE",
  "ORDER_ASSIGNMENT_ISSUE",
  "ORDER_NOT_FEASIBLE",
  "PAYOUT_NOT_ACCEPTABLE",
  "OTHER",
] as const;

export type RiderOrderRejectReasonCode = (typeof RIDER_ORDER_REJECT_REASON_CODES)[number];

const CODE_SET = new Set<string>(RIDER_ORDER_REJECT_REASON_CODES);

export function isValidRiderOrderRejectReasonCode(code: string): code is RiderOrderRejectReasonCode {
  return CODE_SET.has(code.trim().toUpperCase());
}

export const RIDER_ORDER_REJECT_REASON_LABELS: Record<
  RiderOrderRejectReasonCode,
  string
> = {
  PERSONAL_EMERGENCY: "Personal / Emergency Reason",
  GOING_OFF_DUTY: "Going Off Duty",
  VEHICLE_TECHNICAL: "Vehicle or Technical Issue",
  STORE_ISSUE: "Store Related Issue",
  CUSTOMER_REQUESTED_CANCEL: "Customer Requested Cancellation",
  DELIVERY_LOCATION_ISSUE: "Delivery Location Issue",
  ORDER_ASSIGNMENT_ISSUE: "Order Assignment Issue",
  ORDER_NOT_FEASIBLE: "Order Not Feasible",
  PAYOUT_NOT_ACCEPTABLE: "Payout Not Acceptable",
  OTHER: "Other Reason",
};
