/** Keep in sync with backend `ride-rider-payout-snapshot.ts`. */

export function isRideFarePaymentPending(paymentStatus: string | null | undefined): boolean {
  const ps = String(paymentStatus ?? "").trim().toLowerCase();
  return ps !== "paid" && ps !== "completed";
}

export function isRideRiderWalletCreditBlocked(input: {
  orderType?: string | null;
  status?: string | null;
  paymentStatus?: string | null;
  adminRiderPaymentClearedAt?: Date | string | null;
}): boolean {
  if (String(input.orderType ?? "").trim() !== "person_ride") return false;
  if (String(input.status ?? "").trim().toLowerCase() !== "delivered") return false;
  if (
    input.adminRiderPaymentClearedAt != null &&
    String(input.adminRiderPaymentClearedAt).trim().length > 0
  ) {
    return false;
  }
  return isRideFarePaymentPending(input.paymentStatus);
}
