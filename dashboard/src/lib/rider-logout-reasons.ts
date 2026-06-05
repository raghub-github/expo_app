export const RIDER_LOGOUT_REASON_LABELS: Record<string, string> = {
  HAPPY: "No complaints, I am happy",
  PAYMENT_UNDERSTANDING: "Unable to understand payments",
  NO_ORDERS_AREA: "Not getting enough orders",
  PHONE_TECH: "Technical issues",
  PAYMENT_DELAY: "Payment delay",
  TEAM_LEADER_NO_RESPONSE: "Team leader not responding",
  PENALTY_ISSUES: "Penalty issues",
  OTHER: "Other",
};

export function riderLogoutReasonLabel(code: string, reasonText?: string | null): string {
  if (code === "OTHER" && reasonText?.trim()) return reasonText.trim();
  return RIDER_LOGOUT_REASON_LABELS[code] ?? code;
}

export type {
  RiderLogoutEventRow,
  RiderLogoutSessionSnapshot,
} from "@/lib/rider-logout-types";