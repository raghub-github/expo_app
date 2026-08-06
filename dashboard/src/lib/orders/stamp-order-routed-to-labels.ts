/**
 * Client-safe labels for Routed To history (no server-only imports).
 */

export type OrderRoutedToAction =
  | "remark"
  | "refund"
  | "cancel"
  | "status_update"
  | "rider_cancel"
  | "rider_recon"
  | "cx_notification"
  | "clear_rider_hold"
  | "rider_manual_assign"
  | "rider_force_assign";

export const ORDER_ROUTED_TO_ACTION_LABELS: Record<OrderRoutedToAction, string> = {
  remark: "Added remark",
  refund: "Created refund",
  cancel: "Cancelled order",
  status_update: "Updated order status",
  rider_cancel: "Rider cancellation",
  rider_recon: "Rider recon",
  cx_notification: "Sent CX notification",
  clear_rider_hold: "Cleared rider payment hold",
  rider_manual_assign: "Assign rider manually",
  rider_force_assign: "Force Assignment",
};
