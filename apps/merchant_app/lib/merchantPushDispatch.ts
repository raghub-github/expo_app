/**
 * Central dispatch for merchant foreground push events.
 * NotificationSetup / expo-push-kit controller owns the single native listener.
 */
import type { PushNotificationOpenPayload } from "@gatimitra/expo-push-kit";
import { perfAuditMark } from "@/lib/perfAuditLog";

type ForegroundHandler = (payload: PushNotificationOpenPayload) => void;
type ResponseHandler = (payload: PushNotificationOpenPayload) => void;

const foregroundHandlers = new Set<ForegroundHandler>();
const responseHandlers = new Set<ResponseHandler>();

const recentForegroundKeys = new Map<string, number>();
const DEDUPE_MS = 2_000;

function payloadKey(payload: PushNotificationOpenPayload): string {
  const d = payload.data ?? {};
  const id =
    d.notification_id ??
    d.notificationId ??
    d.foodOrderId ??
    d.orderId ??
    d.order_id ??
    "";
  const t = String(d.type ?? d.event ?? d.gmType ?? "");
  return `${t}:${String(id)}:${payload.title ?? ""}:${payload.body ?? ""}`;
}

function shouldDispatchOnce(key: string): boolean {
  const now = Date.now();
  for (const [k, at] of recentForegroundKeys) {
    if (now - at > DEDUPE_MS) recentForegroundKeys.delete(k);
  }
  const last = recentForegroundKeys.get(key);
  if (last != null && now - last < DEDUPE_MS) return false;
  recentForegroundKeys.set(key, now);
  return true;
}

export function registerMerchantForegroundPushHandler(handler: ForegroundHandler): () => void {
  foregroundHandlers.add(handler);
  perfAuditMark("push.handler_registered");
  return () => {
    foregroundHandlers.delete(handler);
    perfAuditMark("push.handler_unregistered");
  };
}

export function registerMerchantNotificationResponseHandler(handler: ResponseHandler): () => void {
  responseHandlers.add(handler);
  perfAuditMark("push.response_handler_registered");
  return () => {
    responseHandlers.delete(handler);
    perfAuditMark("push.response_handler_unregistered");
  };
}

/** Called once from NotificationSetup when expo-push-kit receives a foreground notification. */
export function dispatchMerchantForegroundPush(payload: PushNotificationOpenPayload): void {
  const key = payloadKey(payload);
  if (!shouldDispatchOnce(key)) {
    perfAuditMark("push.foreground_deduped");
    return;
  }
  perfAuditMark("push.foreground_dispatched");
  for (const handler of foregroundHandlers) {
    try {
      handler(payload);
    } catch {
      /* one handler must not break others */
    }
  }
}

/** Called when the user taps a notification (controller response listener). */
export function dispatchMerchantNotificationResponse(payload: PushNotificationOpenPayload): void {
  perfAuditMark("push.response_dispatched");
  for (const handler of responseHandlers) {
    try {
      handler(payload);
    } catch {
      /* ignore */
    }
  }
}
