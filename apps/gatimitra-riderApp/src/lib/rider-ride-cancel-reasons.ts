export const RIDER_RIDE_CANCEL_REASON_CODES = [
  "VEHICLE_ISSUE",
  "CUSTOMER_UNREACHABLE",
  "WRONG_PICKUP",
  "UNSAFE_AREA",
  "LONG_WAIT",
  "OTHER",
] as const;

export type RiderRideCancelReasonCode = (typeof RIDER_RIDE_CANCEL_REASON_CODES)[number];

export type RiderRideCancelReasonOption = {
  code: RiderRideCancelReasonCode;
  labelKey: string;
  defaultLabel: string;
};

export const RIDER_RIDE_CANCEL_REASON_OPTIONS: RiderRideCancelReasonOption[] = [
  {
    code: "VEHICLE_ISSUE",
    labelKey: "orders.activeRide.cancelReason.vehicleIssue",
    defaultLabel: "Vehicle breakdown / issue",
  },
  {
    code: "CUSTOMER_UNREACHABLE",
    labelKey: "orders.activeRide.cancelReason.customerUnreachable",
    defaultLabel: "Customer not responding",
  },
  {
    code: "WRONG_PICKUP",
    labelKey: "orders.activeRide.cancelReason.wrongPickup",
    defaultLabel: "Wrong pickup location",
  },
  {
    code: "UNSAFE_AREA",
    labelKey: "orders.activeRide.cancelReason.unsafeArea",
    defaultLabel: "Unsafe area",
  },
  {
    code: "LONG_WAIT",
    labelKey: "orders.activeRide.cancelReason.longWait",
    defaultLabel: "Waiting too long at pickup",
  },
  {
    code: "OTHER",
    labelKey: "orders.activeRide.cancelReason.other",
    defaultLabel: "Other reason",
  },
];
