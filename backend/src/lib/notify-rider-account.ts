import { emitEvent } from "../modules/notifications/eventBus.js";
import { broadcastRiderBankStatus } from "./rider-bank-status-broadcast.js";

/** Push: RIDER_BLACKLISTED / ACCOUNT_REACTIVATED via account.state_changed. */
export async function notifyRiderAccountStateChange(input: {
  riderId: number;
  newState: "BLACKLISTED" | "REACTIVATED" | "SUSPENDED";
  reason?: string | null;
}): Promise<void> {
  const riderId = Number(input.riderId);
  if (!Number.isInteger(riderId) || riderId < 1) return;
  emitEvent("account.state_changed", {
    userId: `usr_${riderId}`,
    role: "rider",
    newState: input.newState,
    reason: input.reason?.trim() || undefined,
  });
}

/** Push: RIDER_PENALTY when agent/order penalty is applied. */
export async function notifyRiderPenaltyApplied(input: {
  riderId: number;
  amount: number;
  reason?: string | null;
  orderId?: number | string | null;
  penaltyId?: number | string | null;
}): Promise<void> {
  const riderId = Number(input.riderId);
  const amount = Number(input.amount);
  if (!Number.isInteger(riderId) || riderId < 1) return;
  if (!Number.isFinite(amount) || amount <= 0) return;
  emitEvent("rider.penalty", {
    userId: `usr_${riderId}`,
    amount,
    reason: input.reason?.trim() || undefined,
    orderId: input.orderId ?? null,
    penaltyId: input.penaltyId ?? null,
  });
}

/** Push + live broadcast: RIDER_BANK_REJECTED with admin reason. */
export async function notifyRiderBankRejected(input: {
  riderId: number;
  reason: string;
  paymentMethodId?: number | string | null;
}): Promise<void> {
  const riderId = Number(input.riderId);
  const reason = input.reason.trim();
  if (!Number.isInteger(riderId) || riderId < 1) return;
  if (!reason) return;
  emitEvent("rider.bank_rejected", {
    userId: `usr_${riderId}`,
    reason,
    paymentMethodId: input.paymentMethodId ?? null,
  });
  void broadcastRiderBankStatus({
    riderId,
    action: "rejected",
    verificationStatus: "rejected",
    paymentMethodId: input.paymentMethodId ?? null,
    reason,
  });
}

/** Push + live broadcast: RIDER_BANK_APPROVED. */
export async function notifyRiderBankApproved(input: {
  riderId: number;
  paymentMethodId?: number | string | null;
}): Promise<void> {
  const riderId = Number(input.riderId);
  if (!Number.isInteger(riderId) || riderId < 1) return;
  emitEvent("rider.bank_approved", {
    userId: `usr_${riderId}`,
    paymentMethodId: input.paymentMethodId ?? null,
  });
  void broadcastRiderBankStatus({
    riderId,
    action: "approved",
    verificationStatus: "verified",
    paymentMethodId: input.paymentMethodId ?? null,
    reason: null,
  });
}
