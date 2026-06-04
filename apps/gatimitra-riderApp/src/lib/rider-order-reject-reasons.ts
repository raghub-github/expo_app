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

export type RiderOrderRejectReasonOption = {
  code: RiderOrderRejectReasonCode;
  labelKey: string;
  defaultLabel: string;
};

export const RIDER_ORDER_REJECT_REASON_OPTIONS: RiderOrderRejectReasonOption[] = [
  {
    code: "PERSONAL_EMERGENCY",
    labelKey: "orders.rejectReason.personalEmergency",
    defaultLabel: "Personal / Emergency Reason",
  },
  {
    code: "GOING_OFF_DUTY",
    labelKey: "orders.rejectReason.goingOffDuty",
    defaultLabel: "Going Off Duty",
  },
  {
    code: "VEHICLE_TECHNICAL",
    labelKey: "orders.rejectReason.vehicleTechnical",
    defaultLabel: "Vehicle or Technical Issue",
  },
  {
    code: "STORE_ISSUE",
    labelKey: "orders.rejectReason.storeIssue",
    defaultLabel: "Store Related Issue",
  },
  {
    code: "CUSTOMER_REQUESTED_CANCEL",
    labelKey: "orders.rejectReason.customerRequestedCancel",
    defaultLabel: "Customer Requested Cancellation",
  },
  {
    code: "DELIVERY_LOCATION_ISSUE",
    labelKey: "orders.rejectReason.deliveryLocationIssue",
    defaultLabel: "Delivery Location Issue",
  },
  {
    code: "ORDER_ASSIGNMENT_ISSUE",
    labelKey: "orders.rejectReason.orderAssignmentIssue",
    defaultLabel: "Order Assignment Issue",
  },
  {
    code: "ORDER_NOT_FEASIBLE",
    labelKey: "orders.rejectReason.orderNotFeasible",
    defaultLabel: "Order Not Feasible",
  },
  {
    code: "PAYOUT_NOT_ACCEPTABLE",
    labelKey: "orders.rejectReason.payoutNotAcceptable",
    defaultLabel: "Payout Not Acceptable",
  },
  {
    code: "OTHER",
    labelKey: "orders.rejectReason.other",
    defaultLabel: "Other Reason",
  },
];
