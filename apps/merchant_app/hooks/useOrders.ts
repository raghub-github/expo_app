/**
 * Orders hook — live board lives in OrdersContext; types/mapping in lib/orderRecord.
 * Keep this file free of Cycles: OrdersContext must NOT import from here.
 */

export type {
  DeliveryType,
  OrderStage,
  OrderPricing,
  LineItem,
  OrderRecord,
  OrderCounts,
  OrdersState,
} from "@/lib/orderRecord";

export {
  apiStatusToStage,
  stageTransitionToApi,
  mapApiOrder,
  orderRecordToApiFoodOrder,
} from "@/lib/orderRecord";

export { useOrdersContext as useOrders } from "@/context/OrdersContext";
