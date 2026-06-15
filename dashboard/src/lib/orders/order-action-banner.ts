import {
  resolveDispatchManualStage,
  type DispatchManualStage,
} from "@/lib/orders/order-dispatch-status";

export type OrderActionBannerInput = {
  status?: string | null;
  currentStatus?: string | null;
  foodOrderStatus?: string | null;
  hasRider?: boolean;
};

function normalizeKey(value: string | null | undefined): string {
  return (value ?? "")
    .trim()
    .toUpperCase()
    .replace(/[\s-]+/g, "_");
}

function isAcceptedOrPreparing(params: {
  core: string;
  cur: string;
  food: string;
}): boolean {
  const { core, cur, food } = params;
  if (core === "accepted" || cur === "ACCEPTED" || food === "ACCEPTED") return true;
  if (core === "preparing" || cur === "PREPARING" || food === "PREPARING") return true;
  return false;
}

function isPaymentPending(params: { core: string; cur: string }): boolean {
  const { core, cur } = params;
  const paymentStages = new Set([
    "CREATED",
    "PLACED",
    "NEW",
    "ORDER_PLACED",
    "BILL_READY",
    "PAYMENT_INITIATED_AT",
    "PAYMENT_INITIATED",
    "PYMT_ASSIGN_RX",
    "PAYMENT_DONE",
    "ASSIGNED",
  ]);
  const paymentCore = new Set([
    "created",
    "assigned",
    "bill_ready",
    "payment_initiated_at",
    "payment_done",
    "pymt_assign_rx",
  ]);
  return paymentCore.has(core) || paymentStages.has(cur);
}

function messageForStage(
  stage: DispatchManualStage,
  input: OrderActionBannerInput
): string | null {
  const core = (input.status ?? "").toLowerCase().trim();
  const cur = normalizeKey(input.currentStatus);
  const food = normalizeKey(input.foodOrderStatus);

  if (stage === "delivered" || stage === "cancelled") return null;

  if (stage === "dispatched") {
    return "Check whether rider is reaching Cx";
  }

  if (stage === "ready") {
    return input.hasRider
      ? "Check whether rider has reached merchant"
      : "Check whether rider is assigned for pickup";
  }

  if (isAcceptedOrPreparing({ core, cur, food })) {
    return "Check whether order is getting prepared on time";
  }

  if (core === "reached_store" || cur === "RIDER_AT_PICKUP" || cur === "REACHED_STORE") {
    return "Check whether merchant has marked order ready";
  }

  if (isPaymentPending({ core, cur })) {
    return "Check whether merchant has accepted the order";
  }

  return "Check order progress and take action if needed";
}

/** Ops action prompt shown below the order progress timeline. */
export function resolveOrderActionBannerMessage(
  input: OrderActionBannerInput
): string | null {
  const stage = resolveDispatchManualStage({
    status: input.status,
    currentStatus: input.currentStatus,
    foodOrderStatus: input.foodOrderStatus,
  });
  return messageForStage(stage, input);
}
