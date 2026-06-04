export const RIDER_LOGOUT_REASON_CODES = [
  "HAPPY",
  "PAYMENT_UNDERSTANDING",
  "NO_ORDERS_AREA",
  "PHONE_TECH",
  "PAYMENT_DELAY",
  "TEAM_LEADER_NO_RESPONSE",
  "PENALTY_ISSUES",
  "OTHER",
] as const;

export type RiderLogoutReasonCode = (typeof RIDER_LOGOUT_REASON_CODES)[number];

export type RiderLogoutReasonOption = {
  code: RiderLogoutReasonCode;
  labelKey: string;
  defaultLabel: string;
};

export const RIDER_LOGOUT_REASON_OPTIONS: RiderLogoutReasonOption[] = [
  { code: "HAPPY", labelKey: "profile.logoutReason.happy", defaultLabel: "No complaints, I am happy" },
  {
    code: "PAYMENT_UNDERSTANDING",
    labelKey: "profile.logoutReason.paymentUnderstanding",
    defaultLabel: "Unable to understand payments",
  },
  {
    code: "NO_ORDERS_AREA",
    labelKey: "profile.logoutReason.noOrdersArea",
    defaultLabel: "Not getting enough orders",
  },
  { code: "PHONE_TECH", labelKey: "profile.logoutReason.phoneTech", defaultLabel: "Technical issues" },
  { code: "PAYMENT_DELAY", labelKey: "profile.logoutReason.paymentDelay", defaultLabel: "Payment delay" },
  {
    code: "TEAM_LEADER_NO_RESPONSE",
    labelKey: "profile.logoutReason.teamLeaderNoResponse",
    defaultLabel: "Team leader not responding",
  },
  { code: "PENALTY_ISSUES", labelKey: "profile.logoutReason.penaltyIssues", defaultLabel: "Penalty issues" },
  { code: "OTHER", labelKey: "profile.logoutReason.other", defaultLabel: "Other" },
];
