import { getConfig } from "@/config/env";
import { authFetch } from "@/services/authFetch";

const getBase = () => getConfig().apiBaseUrl;

export type StoreNotificationType = "order" | "store" | "system" | "earning";

export interface StoreNotificationRow {
  id: string;
  store_id: number;
  type: StoreNotificationType;
  title: string;
  body: string;
  read: boolean;
  order_id?: number;
  action_url?: string;
  created_at: string;
}

export interface StoreNotificationsResponse {
  notifications: StoreNotificationRow[];
}

export async function getStoreNotifications(
  storeId: number,
  token: string,
  limit = 50
): Promise<StoreNotificationsResponse> {
  const res = await authFetch(
    `${getBase()}/v1/merchant-partner/stores/${storeId}/notifications?limit=${limit}`,
    token
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { error?: string }).error || res.statusText || "Failed to load notifications");
  }
  return res.json() as Promise<StoreNotificationsResponse>;
}

export async function markStoreNotificationRead(
  storeId: number,
  notificationId: string,
  token: string
): Promise<void> {
  const res = await authFetch(
    `${getBase()}/v1/merchant-partner/stores/${storeId}/notifications/${notificationId}/read`,
    token,
    { method: "PATCH" }
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { error?: string }).error || res.statusText || "Failed to mark as read");
  }
}

export async function deleteStoreNotification(
  storeId: number,
  notificationId: string,
  token: string
): Promise<void> {
  const res = await authFetch(
    `${getBase()}/v1/merchant-partner/stores/${storeId}/notifications/${notificationId}`,
    token,
    { method: "DELETE" }
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { error?: string }).error || res.statusText || "Failed to delete notification");
  }
}
