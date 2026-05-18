import { getConfig } from "@/config/env";
import { authFetch } from "@/services/authFetch";

const getBase = () => getConfig().apiBaseUrl.replace(/\/+$/, "");

export type OrderAcceptanceSettings = {
  store_type: string;
  acceptance_window_minutes: number;
  alert_sound_enabled: boolean;
  alert_sound_url: string | null;
  alert_sound_repeat_count: number;
  alert_sound_urls_by_slot: [string | null, string | null, string | null];
  alert_sound_slot_choice: number;
};

export async function fetchOrderAcceptanceSettings(
  storeId: number,
  token: string
): Promise<OrderAcceptanceSettings> {
  const res = await authFetch(
    `${getBase()}/v1/merchant-partner/stores/${storeId}/order-acceptance-settings`,
    token
  );
  const data = (await res.json().catch(() => ({}))) as {
    settings?: OrderAcceptanceSettings;
    error?: string;
  };
  if (!res.ok || !data.settings) {
    throw new Error(data.error || "Failed to load alert settings");
  }
  return data.settings;
}
