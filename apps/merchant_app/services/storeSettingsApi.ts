import { getConfig } from "@/config/env";
import { authFetch } from "@/services/authFetch";

const getBase = () => getConfig().apiBaseUrl;

export type StoreSettings = {
  store_id: number;
  show_floating_orders: boolean;
  platform_delivery: boolean;
  self_delivery: boolean;
};

export async function getStoreSettings(
  storeId: number,
  token: string
): Promise<StoreSettings> {
  const res = await authFetch(`${getBase()}/v1/merchant-partner/stores/${storeId}/settings`, token);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as any).error || res.statusText || "Failed to load store settings");
  }
  const data = (await res.json()) as Partial<StoreSettings>;
  return {
    store_id: Number(data.store_id ?? storeId),
    show_floating_orders: data.show_floating_orders === true,
    platform_delivery: data.platform_delivery !== false,
    self_delivery: data.self_delivery === true,
  };
}

export async function updateStoreSettings(
  storeId: number,
  body: Partial<Pick<StoreSettings, "show_floating_orders" | "platform_delivery" | "self_delivery">>,
  token: string
): Promise<StoreSettings> {
  const res = await authFetch(`${getBase()}/v1/merchant-partner/stores/${storeId}/settings`, token, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as any).error || res.statusText || "Failed to update store settings");
  }
  const data = (await res.json()) as Partial<StoreSettings> & { ok?: boolean };
  return {
    store_id: Number(data.store_id ?? storeId),
    show_floating_orders: data.show_floating_orders === true,
    platform_delivery: data.platform_delivery !== false,
    self_delivery: data.self_delivery === true,
  };
}

export async function getActiveOrdersCount(
  storeId: number,
  token: string
): Promise<number> {
  const res = await authFetch(
    `${getBase()}/v1/merchant-partner/stores/${storeId}/active-orders-count`,
    token
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as any).error || res.statusText || "Failed to load active orders count");
  }
  const data = (await res.json()) as { active_orders?: number };
  const n = Number(data.active_orders ?? 0);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

export type CommunicationSettings = {
  store_id: number;
  whatsapp_notifications: boolean;
  reports: {
    daily_whatsapp: boolean;
    daily_email: boolean;
    weekly_whatsapp: boolean;
    weekly_email: boolean;
  };
  order_notifications: {
    enabled: boolean;
    ring_volume: number; // 0..1
    ring_in_silent: boolean;
  };
  live_complaint_notifications: boolean;
  rider_notifications: boolean;
};

export async function getCommunicationSettings(
  storeId: number,
  token: string
): Promise<CommunicationSettings> {
  const res = await authFetch(
    `${getBase()}/v1/merchant-partner/stores/${storeId}/communication-settings`,
    token
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as any).error || res.statusText || "Failed to load communication settings");
  }
  const data = (await res.json()) as Partial<CommunicationSettings>;
  return {
    store_id: Number(data.store_id ?? storeId),
    whatsapp_notifications: data.whatsapp_notifications === true,
    reports: {
      daily_whatsapp: data.reports?.daily_whatsapp === true,
      daily_email: data.reports?.daily_email === true,
      weekly_whatsapp: data.reports?.weekly_whatsapp === true,
      weekly_email: data.reports?.weekly_email === true,
    },
    order_notifications: {
      // Default ON unless explicitly disabled.
      enabled: data.order_notifications?.enabled !== false,
      ring_volume:
        typeof data.order_notifications?.ring_volume === "number"
          ? Math.min(Math.max(data.order_notifications.ring_volume, 0), 1)
          : 0.6,
      // Default ON unless explicitly disabled.
      ring_in_silent: data.order_notifications?.ring_in_silent !== false,
    },
    live_complaint_notifications: data.live_complaint_notifications === true,
    rider_notifications: data.rider_notifications === true,
  };
}

export async function updateCommunicationSettings(
  storeId: number,
  settings: Partial<CommunicationSettings>,
  token: string
): Promise<void> {
  const res = await authFetch(
    `${getBase()}/v1/merchant-partner/stores/${storeId}/communication-settings`,
    token,
    {
      method: "PATCH",
      body: JSON.stringify({ settings }),
    }
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as any).error || res.statusText || "Failed to update communication settings");
  }
}


