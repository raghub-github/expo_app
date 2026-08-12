import { MX } from "@/lib/appAssetKeys";

/** Live orders tab filter → CMS asset key for empty-state illustration. */
export type OrderStageEmptyKey =
  | "preparing"
  | "ready"
  | "picked_up"
  | "completed"
  | "rto"
  | "scheduled";

const STAGE_TO_ASSET: Record<OrderStageEmptyKey, string> = {
  preparing: MX.orders.emptyPreparing,
  ready: MX.orders.emptyReady,
  picked_up: MX.orders.emptyPickedUp,
  completed: MX.orders.emptyCompleted,
  rto: MX.orders.emptyRto,
  scheduled: MX.orders.emptyScheduled,
};

export function orderStageEmptyAssetKey(stage: OrderStageEmptyKey): string {
  return STAGE_TO_ASSET[stage];
}
